import Foundation
import UIKit
import Capacitor
import CallKit
import PushKit
import UserNotifications

/// Kin's own push in the iPhone app (Jonathan, 29 October): calls ring like
/// Messenger, and an SOS gets through.
///
/// The phone has two Apple tokens, and both are saved like a browser's
/// subscription (lib/apns.ts), so the server's push rules decide who gets
/// what:
/// - "alert": ordinary notifications. An SOS comes time-sensitive, or as a
///   Critical Alert once Apple grants Kin the entitlement.
/// - "voip": a ringing call. It is handed straight to CallKit, so it rings
///   full screen with the iPhone's own incoming-call screen, on silent too,
///   even with Kin closed. Answer opens the call in Kin (/chat?answer=<id>);
///   Decline tells the caller, as the notification's Decline does.
///
/// Apple requires every VoIP push to be reported as a call at once, or it
/// stops sending them: the server only ever sends rings there, and this is
/// set up at launch (AppDelegate), before any page exists, because a ring
/// can wake a closed app.
final class KinCalls: NSObject, PKPushRegistryDelegate, CXProviderDelegate, UNUserNotificationCenterDelegate {
    static let shared = KinCalls()

    private(set) var alertToken: String?
    private(set) var voipToken: String?
    /// A page to open once Kin's web view is ready: an answer that woke a
    /// closed app arrives before the page does.
    var pendingPath: String?
    /// Opens a Kin path in the web view; set by KinPushPlugin when the page loads.
    var open: ((String) -> Void)?
    /// Runs a script in the page, with the member's session; set likewise.
    var run: ((String) -> Void)?
    var onTokens: (() -> Void)?

    private var registry: PKPushRegistry?
    private let provider: CXProvider = {
        let config = CXProviderConfiguration()
        config.supportsVideo = true
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = true
        return CXProvider(configuration: config)
    }()
    /// The Kin call each CallKit call stands for: its id and who is calling.
    private var calls: [UUID: (id: String, from: String)] = [:]

    /// Debug builds talk to Apple's sandbox; TestFlight and the App Store to
    /// production.
    var environment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    func start() {
        provider.setDelegate(self, queue: nil)
        // Set before launch ends, so a tap that opened a closed Kin is not missed.
        UNUserNotificationCenter.current().delegate = self
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        self.registry = registry
        UIApplication.shared.registerForRemoteNotifications()
        // Asked once, at the first launch: notifications are what the app is for.
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    func didRegister(deviceToken: Data) {
        alertToken = deviceToken.map { String(format: "%02x", $0) }.joined()
        onTokens?()
    }

    // MARK: - Notifications: shown while Kin is open, and a tap opens its page

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let path = response.notification.request.content.userInfo["url"] as? String, path.hasPrefix("/") else { return }
        await MainActor.run {
            if let open = self.open { open(path) } else { self.pendingPath = path }
        }
    }

    // MARK: - PushKit

    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        voipToken = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        onTokens?()
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        voipToken = nil
    }

    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        let dict = payload.dictionaryPayload
        let call = dict["call"] as? [String: Any]
        let callId = call?["id"] as? String ?? UUID().uuidString
        let from = call?["from"] as? String ?? ""
        let video = call?["video"] as? Bool ?? false
        let caller = (dict["caller"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Kin"

        let uuid = UUID()
        calls[uuid] = (callId, from)
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: caller)
        update.localizedCallerName = caller
        update.hasVideo = video
        // Reported at once, always: Apple's rule for every VoIP push.
        provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if error == nil {
                // An unanswered ring stops after a minute, as the caller's does.
                DispatchQueue.main.asyncAfter(deadline: .now() + 60) {
                    guard let self, self.calls[uuid] != nil else { return }
                    self.provider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
                    self.calls[uuid] = nil
                }
            }
            completion()
        }
    }

    // MARK: - CallKit

    func providerDidReset(_ provider: CXProvider) {
        calls.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        guard let call = calls[action.callUUID] else { action.fail(); return }
        action.fulfill()
        // The call itself is the web app's (WebRTC in the page): CallKit's
        // screen goes, and Kin opens on the call, already answering.
        calls[action.callUUID] = nil
        provider.reportCall(with: action.callUUID, endedAt: Date(), reason: .answeredElsewhere)
        let path = "/chat?answer=\(call.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? call.id)"
        DispatchQueue.main.async {
            if let open = self.open { open(path) } else { self.pendingPath = path }
        }
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let call = calls[action.callUUID]
        calls[action.callUUID] = nil
        action.fulfill()
        guard let call else { return }
        // Declined: the caller's phone stops ringing and says so. Sent from
        // the page so it carries the member's own session (api/calls/decline).
        let body = ["call": call.id, "from": call.from]
        guard let json = try? JSONSerialization.data(withJSONObject: body), let text = String(data: json, encoding: .utf8) else { return }
        let script = "fetch('/api/calls/decline',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(\(text))}).catch(function(){})"
        DispatchQueue.main.async { self.run?(script) }
    }
}

/// The page's way to the tokens (components/native-push.tsx).
@objc(KinPushPlugin)
public class KinPushPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KinPushPlugin"
    public let jsName = "KinPush"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "tokens", returnType: CAPPluginReturnPromise),
    ]

    public override func load() {
        let calls = KinCalls.shared
        calls.open = { [weak self] path in
            guard let self, let base = self.bridge?.config.serverURL, let url = URL(string: path, relativeTo: base) else { return }
            self.bridge?.webView?.load(URLRequest(url: url))
        }
        calls.run = { [weak self] script in
            self?.bridge?.webView?.evaluateJavaScript(script, completionHandler: nil)
        }
        calls.onTokens = { [weak self] in self?.notifyListeners("tokens", data: [:]) }
        if let path = calls.pendingPath {
            calls.pendingPath = nil
            // After the first page has started, so this one wins.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { calls.open?(path) }
        }
    }

    @objc func tokens(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let calls = KinCalls.shared
            var list: [[String: String]] = []
            if let t = calls.alertToken { list.append(["channel": "alert", "token": t, "env": calls.environment]) }
            if let t = calls.voipToken { list.append(["channel": "voip", "token": t, "env": calls.environment]) }
            call.resolve(["tokens": list])
        }
    }
}

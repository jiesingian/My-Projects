import Foundation
import Capacitor
import CryptoKit
import UserNotifications
#if canImport(AlarmKit)
import AlarmKit
import SwiftUI
#elseif KIN_REQUIRE_ALARMKIT
// CI builds with this set (.github/workflows/ios.yml), so an SDK without
// AlarmKit fails the build instead of quietly leaving the alarms out.
#error("AlarmKit is missing: build with Xcode 26 or later")
#endif

/// Kin's real alarms (Jonathan, 29 October): medicine doses, and the plans,
/// check-ups and bills a member switched on, ring like the Clock app --
/// full screen, with sound even on silent, offline too.
///
/// The web page inside the app (components/native-alarm-sync.tsx) asks
/// api/alarms for the next two weeks each time Kin opens, and hands the list
/// to `replaceAll`. Every alarm Kin set before is cancelled and the new list
/// is set, so a medicine stopped or a plan switched off stops ringing at the
/// next open. On iOS 26 and later this is AlarmKit. Before that, iOS has no
/// alarms for apps, so they come as time-sensitive notifications: through
/// Focus, but not through the silent switch.
@objc(KinAlarmsPlugin)
public class KinAlarmsPlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    public let identifier = "KinAlarmsPlugin"
    public let jsName = "KinAlarms"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replaceAll", returnType: CAPPluginReturnPromise),
    ]

    /// Notifications Kin set as alarms carry this in their identifier, so
    /// `replaceAll` only ever removes its own.
    static let notificationPrefix = "kin-alarm:"
    static let maxAlarms = 60

    public override func load() {
        UNUserNotificationCenter.current().delegate = self
    }

    // MARK: - Methods called from the page

    @objc func status(_ call: CAPPluginCall) {
        Task { call.resolve(await self.currentStatus()) }
    }

    @objc func authorize(_ call: CAPPluginCall) {
        Task {
            #if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                _ = try? await AlarmManager.shared.requestAuthorization()
                call.resolve(await self.currentStatus())
                return
            }
            #endif
            _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            call.resolve(await self.currentStatus())
        }
    }

    @objc func replaceAll(_ call: CAPPluginCall) {
        let raw = call.getArray("alarms", JSObject.self) ?? []
        let alarms = raw.compactMap(KinAlarm.init).filter { $0.at > Date() }.prefix(Self.maxAlarms)
        Task {
            #if canImport(AlarmKit)
            if #available(iOS 26.0, *) {
                await self.replaceWithAlarmKit(Array(alarms))
                call.resolve(await self.currentStatus())
                return
            }
            #endif
            await self.replaceWithNotifications(Array(alarms))
            call.resolve(await self.currentStatus())
        }
    }

    // MARK: - Status

    private func currentStatus() async -> [String: Any] {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            let state: String
            switch AlarmManager.shared.authorizationState {
            case .authorized: state = "authorized"
            case .denied: state = "denied"
            default: state = "notDetermined"
            }
            let count = (try? AlarmManager.shared.alarms.count) ?? 0
            return ["engine": "alarmkit", "authorization": state, "scheduled": count]
        }
        #endif
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        let state: String
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: state = "authorized"
        case .denied: state = "denied"
        default: state = "notDetermined"
        }
        let pending = await UNUserNotificationCenter.current().pendingNotificationRequests()
        let count = pending.filter { $0.identifier.hasPrefix(Self.notificationPrefix) }.count
        return ["engine": "notifications", "authorization": state, "scheduled": count]
    }

    // MARK: - AlarmKit (iOS 26 and later)

    #if canImport(AlarmKit)
    @available(iOS 26.0, *)
    private func replaceWithAlarmKit(_ alarms: [KinAlarm]) async {
        let manager = AlarmManager.shared
        guard manager.authorizationState == .authorized else { return }
        // Every alarm this app has is one Kin set: clear them all, then set
        // the list afresh.
        for existing in (try? manager.alarms) ?? [] {
            try? manager.cancel(id: existing.id)
        }
        for alarm in alarms {
            let alert = AlarmPresentation.Alert(
                title: LocalizedStringResource(stringLiteral: alarm.headline),
                stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle")
            )
            let attributes = AlarmAttributes<KinAlarmMetadata>(
                presentation: AlarmPresentation(alert: alert),
                metadata: KinAlarmMetadata(url: alarm.url),
                tintColor: Color(red: 0.84, green: 0.23, blue: 0.33)
            )
            let configuration = AlarmManager.AlarmConfiguration<KinAlarmMetadata>(
                countdownDuration: nil,
                schedule: .fixed(alarm.at),
                attributes: attributes
            )
            _ = try? await manager.schedule(id: alarm.uuid, configuration: configuration)
        }
    }
    #endif

    // MARK: - Notifications (before iOS 26)

    private func replaceWithNotifications(_ alarms: [KinAlarm]) async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
        let pending = await center.pendingNotificationRequests()
        center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(Self.notificationPrefix) })
        for alarm in alarms {
            let content = UNMutableNotificationContent()
            content.title = alarm.title
            content.body = alarm.body
            content.sound = .default
            content.interruptionLevel = .timeSensitive
            content.userInfo = ["url": alarm.url]
            let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: alarm.at)
            let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
            try? await center.add(UNNotificationRequest(identifier: Self.notificationPrefix + alarm.id, content: content, trigger: trigger))
        }
    }

    // MARK: - Opening the alarm's page

    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let path = response.notification.request.content.userInfo["url"] as? String else { return }
        await MainActor.run { self.open(path) }
    }

    /// Opens a Kin page (a path such as /today/dose?...) in the app's web view.
    @MainActor
    func open(_ path: String) {
        guard path.hasPrefix("/"), let base = bridge?.config.serverURL,
              let url = URL(string: path, relativeTo: base) else { return }
        bridge?.webView?.load(URLRequest(url: url))
    }
}

/// What a Kin alarm carries back when it rings (AlarmKit), for opening its page.
struct KinAlarmMetadata: Codable, Hashable, Sendable {
    var url: String
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
extension KinAlarmMetadata: AlarmMetadata {}
#endif

/// One alarm as api/alarms sends it (lib/alarms.ts, KinAlarm).
struct KinAlarm {
    let id: String
    let at: Date
    let title: String
    let body: String
    let url: String

    init?(_ o: JSObject) {
        guard let id = o["id"] as? String, let atText = o["at"] as? String, let title = o["title"] as? String else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let at = iso.date(from: atText) ?? ISO8601DateFormatter().date(from: atText) else { return nil }
        self.id = id
        self.at = at
        self.title = title
        self.body = (o["body"] as? String) ?? ""
        self.url = (o["url"] as? String) ?? "/today"
    }

    /// AlarmKit shows one line, so the detail rides on the title.
    var headline: String { body.isEmpty ? title : "\(title) · \(body)" }

    /// The same alarm always gets the same id.
    var uuid: UUID {
        let d = Array(SHA256.hash(data: Data(id.utf8)))
        return UUID(uuid: (d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9], d[10], d[11], d[12], d[13], d[14], d[15]))
    }
}

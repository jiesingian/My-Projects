import Foundation
import UIKit
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
/// next open -- or sooner: a silent push wakes the app once a day and after a
/// change (KinAlarmSync, below), so the two weeks never run out. On iOS 26
/// and later this is AlarmKit. Before that, iOS has no
/// alarms for apps, so they come as time-sensitive notifications: through
/// Focus, but not through the silent switch.
@objc(KinAlarmsPlugin)
public class KinAlarmsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KinAlarmsPlugin"
    public let jsName = "KinAlarms"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replaceAll", returnType: CAPPluginReturnPromise),
    ]

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
        let alarms = raw.compactMap { KinAlarm($0 as [String: Any]) }
        Task {
            await KinAlarmScheduler.replace(alarms)
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
        let count = pending.filter { $0.identifier.hasPrefix(KinAlarmScheduler.notificationPrefix) }.count
        return ["engine": "notifications", "authorization": state, "scheduled": count]
    }

    // Tapping one of these opens its page: KinCalls (KinPushPlugin.swift)
    // is the notification delegate for the whole app, set at launch.
}

/// Sets Kin's alarms on the phone: from the page (`replaceAll`) and from the
/// silent push (KinAlarmSync), so both go the same way.
enum KinAlarmScheduler {
    /// Notifications Kin set as alarms carry this in their identifier, so
    /// `replace` only ever removes its own.
    static let notificationPrefix = "kin-alarm:"
    static let maxAlarms = 60

    /// Every alarm Kin set before is cancelled and this list is set.
    static func replace(_ list: [KinAlarm]) async {
        let alarms = Array(list.filter { $0.at > Date() }.prefix(maxAlarms))
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            await replaceWithAlarmKit(alarms)
            return
        }
        #endif
        await replaceWithNotifications(alarms)
    }

    // MARK: - AlarmKit (iOS 26 and later)

    #if canImport(AlarmKit)
    @available(iOS 26.0, *)
    private static func replaceWithAlarmKit(_ alarms: [KinAlarm]) async {
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

    private static func replaceWithNotifications(_ alarms: [KinAlarm]) async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
        let pending = await center.pendingNotificationRequests()
        center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(notificationPrefix) })
        for alarm in alarms {
            let content = UNMutableNotificationContent()
            content.title = alarm.title
            content.body = alarm.body
            content.sound = .default
            content.interruptionLevel = .timeSensitive
            content.userInfo = ["url": alarm.url]
            let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: alarm.at)
            let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
            try? await center.add(UNNotificationRequest(identifier: notificationPrefix + alarm.id, content: content, trigger: trigger))
        }
    }
}

/// The app's half of the silent push that keeps the alarms topped up
/// (lib/apns.ts, apnsWakeRequest; due_alarm_wakes, 20261029200000). Apple
/// wakes the app in the background, once a day and after a medicine, picked
/// plan, check-up or bill changes, for about 30 seconds.
///
/// With Kin open on screen, the page is told to sync itself, as it does when
/// it opens (components/native-alarm-sync.tsx). Otherwise there may be no
/// page at all, so the app asks api/alarms itself as the member (KinSession,
/// KinWidgetStore.swift: the web view's own session cookies). Signed out, or
/// no signal: the alarms already set stay as they were. The widgets are read
/// again on the same wake.
enum KinAlarmSync {
    static func handle(_ completion: @escaping (UIBackgroundFetchResult) -> Void) {
        Task { @MainActor in
            if UIApplication.shared.applicationState == .active, let run = KinCalls.shared.run {
                run("window.dispatchEvent(new Event('kin:alarms-changed'))")
                await KinWidgetStore.refresh()
                completion(.newData)
                return
            }
            let result = await fetchAndSet()
            await KinWidgetStore.refresh()
            completion(result)
        }
    }

    @MainActor
    static func fetchAndSet() async -> UIBackgroundFetchResult {
        guard let answer = await KinSession.get("api/alarms") else { return .noData }
        guard answer.status == 200,
              let json = try? JSONSerialization.jsonObject(with: answer.data) as? [String: Any],
              let list = json["alarms"] as? [[String: Any]] else { return answer.status == 401 ? .noData : .failed }
        await KinAlarmScheduler.replace(list.compactMap(KinAlarm.init))
        return .newData
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

    init?(_ o: [String: Any]) {
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

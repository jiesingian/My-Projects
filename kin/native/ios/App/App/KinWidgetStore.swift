import Foundation
import UIKit
import WebKit
import WidgetKit

/// A request to Kin as the signed-in member, from the app itself rather than
/// the page: the silent alarm push (KinAlarmSync) and the widgets
/// (KinWidgetStore) both need one, often with no page loaded -- a closed app
/// is woken without its window.
///
/// It carries the web view's own session cookies, read from its store
/// (WKWebsiteDataStore), the one place the session lives. Not a second login
/// or a token kept in the app: nothing new to keep safe or to go stale, the
/// route reads through row-level security as the member exactly as the page
/// does, and signing out in Kin ends it too. If the server refreshes the
/// session on the way, its new cookies go back into the web view's store;
/// otherwise the page would carry a used refresh token and be signed out.
enum KinSession {
    static let server = URL(string: "https://kin-family-app.vercel.app")!

    /// The body and status, or nil with no session or no signal.
    @MainActor
    static func get(_ path: String) async -> (data: Data, status: Int)? {
        let url = server.appendingPathComponent(path)
        let host = server.host ?? ""
        let store = WKWebsiteDataStore.default().httpCookieStore
        let cookies = await store.allCookies().filter { c in
            let domain = c.domain.hasPrefix(".") ? String(c.domain.dropFirst()) : c.domain
            return host == domain || host.hasSuffix("." + domain)
        }
        guard !cookies.isEmpty else { return nil }

        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        for (name, value) in HTTPCookie.requestHeaderFields(with: cookies) {
            request.setValue(value, forHTTPHeaderField: name)
        }
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // Cookies are handled by hand, against the web view's store only.
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        let session = URLSession(configuration: config)
        defer { session.finishTasksAndInvalidate() }

        guard let result = try? await session.data(for: request), let http = result.1 as? HTTPURLResponse else { return nil }
        if let setCookie = http.value(forHTTPHeaderField: "Set-Cookie") {
            for cookie in HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": setCookie], for: url) {
                await store.setCookie(cookie)
            }
        }
        return (result.0, http.statusCode)
    }
}

/// The widgets' data (KinWidgets, lib/widget.ts): read from api/widget as the
/// member and left in the App Group the widget extension shares with the app,
/// since a widget can't sign in. Read when Kin opens, when it goes to the
/// background (so a dose just ticked is off the widget), and when the silent
/// alarm push wakes it.
enum KinWidgetStore {
    static let appGroup = "group.com.jiesingian.kin"

    @MainActor
    static func refresh() async {
        guard let defaults = UserDefaults(suiteName: appGroup), let answer = await KinSession.get("api/widget") else { return }
        switch answer.status {
        case 200:
            defaults.set(answer.data, forKey: "snapshot")
        case 401:
            // Signed out: nobody's medicines stay on the Lock Screen.
            defaults.removeObject(forKey: "snapshot")
        default:
            return
        }
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// From the background: asks iOS for the few seconds the read needs, and
    /// gives them back when it's done or when iOS wants them.
    @MainActor
    static func refreshInBackground() {
        let lease = BackgroundLease()
        lease.id = UIApplication.shared.beginBackgroundTask(withName: "kin-widget") { MainActor.assumeIsolated { lease.end() } }
        Task { @MainActor in
            await refresh()
            lease.end()
        }
    }
}

@MainActor
private final class BackgroundLease {
    var id: UIBackgroundTaskIdentifier = .invalid
    func end() {
        guard id != .invalid else { return }
        UIApplication.shared.endBackgroundTask(id)
        id = .invalid
    }
}

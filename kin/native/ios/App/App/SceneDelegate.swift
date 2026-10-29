import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = KinBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        // A widget tapped while Kin was closed: opened once the page is ready.
        if let path = connectionOptions.urlContexts.compactMap({ Self.widgetPath($0.url) }).first {
            KinCalls.shared.pendingPath = path
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        if let path = URLContexts.compactMap({ Self.widgetPath($0.url) }).first {
            if let open = KinCalls.shared.open { open(path) } else { KinCalls.shared.pendingPath = path }
            return
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    // The widgets (KinWidgetStore.swift): read again each time Kin comes to
    // the front, and as it leaves, so a dose just ticked is off the widget.
    func sceneDidBecomeActive(_ scene: UIScene) {
        Task { @MainActor in await KinWidgetStore.refresh() }
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        KinWidgetStore.refreshInBackground()
    }

    /// A widget's tap, kin://open?path=/planner: the Kin page it names, only
    /// ever one of Kin's own.
    static func widgetPath(_ url: URL) -> String? {
        guard url.scheme == "kin", url.host == "open",
              let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "path" })?.value,
              path.hasPrefix("/"), !path.hasPrefix("//") else { return nil }
        return path
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

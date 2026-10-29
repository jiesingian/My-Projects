import UIKit
import Capacitor

/// Capacitor's web view, with Kin's own native plugins registered: the page
/// reaches them as `Capacitor.Plugins.<jsName>` (lib/native.ts).
class KinBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(KinAlarmsPlugin())
    }
}

import WidgetKit
import SwiftUI

/// Kin's Home Screen and Lock Screen widgets (approved 30 September): Today's
/// next dose and next plan, and how many things are on the To-Buy list.
///
/// The widget never signs in or asks the server. The app reads api/widget as
/// the member (lib/widget.ts) when Kin opens, when it goes to the background
/// and when the silent alarm push wakes it, and leaves the answer in the App
/// Group (KinWidgetStore, in the app); this reads it from there. The rest of
/// the day's doses and plans ride along, so the widget steps on to the next
/// one at its time by itself. Tapping opens Kin at the live page.

let kinAppGroup = "group.com.jiesingian.kin"
let kinTint = Color(red: 0.84, green: 0.23, blue: 0.33)

struct WidgetItem: Codable, Hashable {
    var title: String
    var detail: String
    var at: Date
    var url: String
}

struct WidgetSnapshot: Codable {
    var updatedAt: Date
    var day: String
    var doses: [WidgetItem]
    var plans: [WidgetItem]
    var toBuy: Int
    var toBuyUrl: String

    static func load() -> WidgetSnapshot? {
        guard let data = UserDefaults(suiteName: kinAppGroup)?.data(forKey: "snapshot") else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { d in
            let text = try d.singleValueContainer().decode(String.self)
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso.date(from: text) ?? ISO8601DateFormatter().date(from: text) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: d.codingPath, debugDescription: "Not a date"))
        }
        return try? decoder.decode(WidgetSnapshot.self, from: data)
    }
}

/// A dose still not taken an hour after its time stays shown, as late; Kin
/// itself chases it from there.
let lateFor: TimeInterval = 3600

struct KinEntry: TimelineEntry {
    let date: Date
    let dose: WidgetItem?
    let plan: WidgetItem?
    let toBuy: Int?
    let toBuyUrl: String
    /// Nothing read yet: the app has not been opened since it was installed.
    let empty: Bool

    static let placeholder = KinEntry(
        date: Date(),
        dose: WidgetItem(title: "Losartan", detail: "50mg", at: Date().addingTimeInterval(3600), url: "/today"),
        plan: WidgetItem(title: "Sunday lunch", detail: "12:00 pm", at: Date().addingTimeInterval(7200), url: "/planner"),
        toBuy: 4,
        toBuyUrl: "/household?seg=buy",
        empty: false
    )

    init(date: Date, dose: WidgetItem?, plan: WidgetItem?, toBuy: Int?, toBuyUrl: String, empty: Bool) {
        self.date = date
        self.dose = dose
        self.plan = plan
        self.toBuy = toBuy
        self.toBuyUrl = toBuyUrl
        self.empty = empty
    }

    /// What the widget shows at `date`, from what the app last read.
    init(at date: Date, from s: WidgetSnapshot?) {
        guard let s else {
            self.init(date: date, dose: nil, plan: nil, toBuy: nil, toBuyUrl: "/household?seg=buy", empty: true)
            return
        }
        // Read on another day: its doses and plans are not today's.
        let sameDay = Calendar.current.isDate(s.updatedAt, inSameDayAs: date)
        self.init(
            date: date,
            dose: sameDay ? s.doses.first { $0.at.addingTimeInterval(lateFor) > date } : nil,
            plan: sameDay ? s.plans.first { $0.at > date } : nil,
            toBuy: s.toBuy,
            toBuyUrl: s.toBuyUrl,
            empty: false
        )
    }
}

struct KinProvider: TimelineProvider {
    func placeholder(in context: Context) -> KinEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (KinEntry) -> Void) {
        completion(context.isPreview ? .placeholder : KinEntry(at: Date(), from: WidgetSnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<KinEntry>) -> Void) {
        let now = Date()
        let snapshot = WidgetSnapshot.load()
        // A new entry each time the next dose or plan changes: at each time,
        // and as a dose stops being "late".
        var moments: Set<Date> = [now]
        for item in snapshot?.doses ?? [] {
            moments.insert(item.at)
            moments.insert(item.at.addingTimeInterval(lateFor))
        }
        for item in snapshot?.plans ?? [] { moments.insert(item.at) }
        let midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(86_400))
        moments.insert(midnight)
        let entries = moments.filter { $0 >= now && $0 <= midnight }.sorted().prefix(40).map { KinEntry(at: $0, from: snapshot) }
        completion(Timeline(entries: Array(entries), policy: .after(midnight)))
    }
}

/// Where a tap goes: Kin opens on this page (SceneDelegate, kin://open).
func kinLink(_ path: String) -> URL {
    var c = URLComponents()
    c.scheme = "kin"
    c.host = "open"
    c.queryItems = [URLQueryItem(name: "path", value: path.hasPrefix("/") ? path : "/today")]
    return c.url ?? URL(string: "kin://open?path=/today")!
}

// MARK: - Today: next dose and next plan

struct TodayView: View {
    @Environment(\.widgetFamily) var family
    let entry: KinEntry

    var body: some View {
        switch family {
        case .accessoryInline:
            if let d = entry.dose {
                Text("\(Image(systemName: "pills.fill")) \(d.at, style: .time) \(d.title)")
            } else if let p = entry.plan {
                Text("\(Image(systemName: "calendar")) \(p.at, style: .time) \(p.title)")
            } else {
                Text("Kin · nothing more today")
            }
        case .accessoryCircular:
            VStack(spacing: 0) {
                Image(systemName: entry.dose != nil ? "pills.fill" : "calendar")
                if let at = entry.dose?.at ?? entry.plan?.at {
                    Text(at, style: .time).font(.caption2).minimumScaleFactor(0.6)
                } else {
                    Text("–").font(.caption2)
                }
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                line(icon: "pills.fill", item: entry.dose, none: "No more doses")
                line(icon: "calendar", item: entry.plan, none: "No more plans")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            VStack(alignment: .leading, spacing: 8) {
                Text("Today").font(.caption.weight(.semibold)).foregroundStyle(kinTint)
                if entry.empty {
                    Text("Open Kin once to fill this in.").font(.footnote).foregroundStyle(.secondary)
                } else {
                    block(icon: "pills.fill", label: "Next dose", item: entry.dose, none: "No more doses today")
                    block(icon: "calendar", label: "Next plan", item: entry.plan, none: "No more plans today")
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private func line(icon: String, item: WidgetItem?, none: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.caption2)
            if let item {
                Text("\(item.at, style: .time) \(item.title)").font(.caption).lineLimit(1)
            } else {
                Text(none).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }
    }

    private func block(icon: String, label: String, item: WidgetItem?, none: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Label(label, systemImage: icon).font(.caption2).foregroundStyle(.secondary)
            if let item {
                Text(item.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                HStack(spacing: 4) {
                    Text(item.at, style: .time)
                    if item.at < entry.date { Text("· late").foregroundStyle(kinTint) }
                    if !item.detail.isEmpty { Text("· \(item.detail)").lineLimit(1) }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            } else {
                Text(none).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct KinTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "KinToday", provider: KinProvider()) { entry in
            TodayView(entry: entry)
                .widgetURL(kinLink(entry.dose?.url ?? entry.plan?.url ?? "/today"))
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Today")
        .description("Your next dose and your next plan.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline, .accessoryCircular])
    }
}

// MARK: - To-Buy count

struct ToBuyView: View {
    @Environment(\.widgetFamily) var family
    let entry: KinEntry

    var count: String { entry.toBuy.map { "\($0)" } ?? "–" }

    var body: some View {
        switch family {
        case .accessoryInline:
            Text("\(Image(systemName: "cart.fill")) \(count) to buy")
        case .accessoryCircular:
            VStack(spacing: 0) {
                Image(systemName: "cart.fill")
                Text(count).font(.headline)
            }
        case .accessoryRectangular:
            VStack(alignment: .leading) {
                Label("To-Buy", systemImage: "cart.fill").font(.caption2)
                Text(entry.toBuy == 0 ? "All bought" : "\(count) on the list").font(.headline)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            VStack(alignment: .leading, spacing: 4) {
                Label("To-Buy", systemImage: "cart.fill").font(.caption.weight(.semibold)).foregroundStyle(kinTint)
                Spacer(minLength: 0)
                Text(count).font(.system(size: 44, weight: .bold, design: .rounded))
                Text(entry.toBuy == 0 ? "All bought" : "on the list").font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

struct KinToBuyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "KinToBuy", provider: KinProvider()) { entry in
            ToBuyView(entry: entry)
                .widgetURL(kinLink(entry.toBuyUrl))
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("To-Buy")
        .description("How many things are on the family's To-Buy list.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct KinWidgets: WidgetBundle {
    var body: some Widget {
        KinTodayWidget()
        KinToBuyWidget()
    }
}

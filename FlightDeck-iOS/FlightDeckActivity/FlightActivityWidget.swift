import ActivityKit
import SwiftUI
import WidgetKit

@main
struct FlightActivityWidget: Widget {
    private let blue = Color(red: 0.47, green: 0.72, blue: 1)
    private let mint = Color(red: 0.51, green: 0.85, blue: 0.70)
    private let navy = Color(red: 0.06, green: 0.11, blue: 0.20)

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FlightActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("FlightDeck").foregroundStyle(blue)
                    Spacer()
                    if let number = context.state.number {
                        Text(number).lineLimit(1)
                    }
                }
                .font(.caption.weight(.semibold))
                HStack(spacing: 12) {
                    airport(context.state.departure)
                    route
                    airport(context.state.arrival)
                }
                details(context.state, stale: context.isStale)
            }
            .padding(16)
            .foregroundStyle(.white)
            .activityBackgroundTint(navy)
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    airport(context.state.departure)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    airport(context.state.arrival)
                }
                DynamicIslandExpandedRegion(.center) {
                    Image(systemName: "airplane").foregroundStyle(blue)
                    if let number = context.state.number {
                        Text(number).font(.caption2).lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    details(context.state, stale: context.isStale)
                }
            } compactLeading: {
                HStack(spacing: 4) {
                    Image(systemName: "airplane").foregroundStyle(blue)
                        .accessibilityHidden(true)
                    Text(context.state.departure).minimumScaleFactor(0.8)
                }
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .accessibilityLabel(localized("Вылет: %@", context.state, context.state.departure))
            } compactTrailing: {
                Text(context.state.arrival)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .accessibilityLabel(localized("Прилет: %@", context.state, context.state.arrival))
            } minimal: {
                Image(systemName: "airplane").foregroundStyle(blue)
                    .accessibilityLabel("FlightDeck, \(localized(context.state.status, context.state))")
            }
            .keylineTint(blue)
        }
    }

    private func localized(_ key: String, _ state: FlightActivityAttributes.ContentState, _ args: String...) -> String {
        FlightLanguage.text(key, language: state.language ?? FlightLanguage.current, args: args)
    }

    private func airport(_ code: String) -> some View {
        Text(code)
            .font(.title2.weight(.semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }

    private var route: some View {
        ZStack {
            Capsule()
                .fill(LinearGradient(colors: [blue, mint], startPoint: .leading, endPoint: .trailing))
                .frame(height: 2)
            Image(systemName: "airplane")
                .foregroundStyle(blue)
                .padding(.horizontal, 6)
                .background(navy)
        }
        .accessibilityHidden(true)
    }

    private func details(_ state: FlightActivityAttributes.ContentState, stale: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ViewThatFits(in: .horizontal) {
                HStack {
                    status(state)
                    Spacer(minLength: 12)
                    arrival(state)
                }
                .fixedSize(horizontal: true, vertical: false)
                VStack(alignment: .leading, spacing: 4) {
                    status(state)
                    arrival(state)
                }
            }
            if let alternate = state.diversionAirport {
                Text(localized("Запасной · %@", state, alternate)).foregroundStyle(.secondary)
            }
            if stale {
                Text(localized("Открой FlightDeck для обновления", state)).foregroundStyle(.secondary)
            }
        }
        .font(.caption)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func status(_ state: FlightActivityAttributes.ContentState) -> some View {
        Text(localized(state.status, state))
            .fontWeight(.semibold)
            .foregroundStyle(state.status == "Выполнен" ? mint : blue)
    }

    @ViewBuilder private func arrival(_ state: FlightActivityAttributes.ContentState) -> some View {
        if let time = state.plannedArrivalUTC {
            Text(localized("План · %@ UTC", state, time))
                .monospacedDigit()
                .foregroundStyle(.secondary)
        }
    }
}

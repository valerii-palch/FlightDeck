import ActivityKit
import Foundation

struct FlightActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let number: String?
        let departure: String
        let arrival: String
        let status: String
        let plannedArrivalUTC: String?
        let diversionAirport: String?
        var language: String?
    }

    let flightID: String
}

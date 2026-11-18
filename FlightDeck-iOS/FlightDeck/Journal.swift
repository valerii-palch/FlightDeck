import Foundation

struct Journal: Decodable {
    let flights: [Flight]
    let airports: [Airport]
    let profileName: String?
}

struct Airport: Decodable {
    let icao: String
    let iata: String?
    let name: String?
    let cityRu: String?
    let cityEn: String?

    func city(language: String) -> String? {
        let names = language == "en" ? [cityEn, name, cityRu] : [cityRu, name, cityEn]
        return names.compactMap { $0 }.first { !$0.isEmpty }
    }
}

struct Flight: Decodable, Identifiable {
    let id: String
    let number: String?
    let tail: String
    let date: String
    let dep: String
    let arr: String
    let demo: Bool?
    let estimatedMinutes: Int?
    let diversionAirport: String?
    let continuation: Leg?
    let leg: Leg

    enum CodingKeys: String, CodingKey {
        case id, number, tail, date, dep, arr, demo, diversionAirport, continuation, estimatedMinutes
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        number = try values.decodeIfPresent(String.self, forKey: .number)
        tail = try values.decode(String.self, forKey: .tail)
        date = try values.decode(String.self, forKey: .date)
        dep = try values.decode(String.self, forKey: .dep)
        arr = try values.decode(String.self, forKey: .arr)
        demo = try values.decodeIfPresent(Bool.self, forKey: .demo)
        diversionAirport = try values.decodeIfPresent(String.self, forKey: .diversionAirport)
        continuation = try values.decodeIfPresent(Leg.self, forKey: .continuation)
        estimatedMinutes = try values.decodeIfPresent(Int.self, forKey: .estimatedMinutes)
        leg = try Leg(from: decoder)
    }

    var diverted: Bool { leg.status == "Уход на запасной" }
    var finalArrival: Date? {
        guard leg.status != "Отменен" else { return nil }
        if diverted {
            guard let continuation, continuation.status != "Отменен" else { return nil }
            return continuation.actualArrival
        }
        return leg.actualArrival
    }
    var status: String {
        if leg.status == "Отменен" { return leg.status }
        if diverted {
            return continuation?.status == "Выполнен" || finalArrival != nil ? "Выполнен" : leg.status
        }
        return finalArrival != nil ? "Выполнен" : leg.status
    }
    var arrivalDifference: Int? {
        guard let plan = leg.arrival, let actual = finalArrival else { return nil }
        return Int((actual.timeIntervalSince(plan) / 60).rounded())
    }
}

struct Leg: Decodable {
    let date: String
    let std: String?
    let sta: String?
    let atd: String?
    let ata: String?
    let atdDate: String?
    let ataDate: String?
    let status: String

    var departure: Date? { Self.utc(date, std) }
    var arrival: Date? {
        guard let value = Self.utc(date, sta) else { return nil }
        return departure.map { value < $0 } == true ? value.addingTimeInterval(86_400) : value
    }
    var actualDeparture: Date? {
        guard let value = Self.utc(atdDate ?? date, atd) else { return nil }
        guard atdDate == nil, let departure else { return value }
        return value.addingTimeInterval((departure.timeIntervalSince(value) / 86_400).rounded() * 86_400)
    }
    var actualArrival: Date? {
        guard let value = Self.utc(ataDate ?? date, ata) else { return nil }
        if ataDate != nil { return value }
        if let actualDeparture {
            return value.addingTimeInterval(ceil(actualDeparture.timeIntervalSince(value) / 86_400) * 86_400)
        }
        guard let arrival else { return value }
        return value.addingTimeInterval((arrival.timeIntervalSince(value) / 86_400).rounded() * 86_400)
    }

    static func utc(_ day: String, _ time: String?) -> Date? {
        guard let time, time.count == 5 else { return nil }
        return ISO8601DateFormatter().date(from: "\(day)T\(time):00Z")
    }
}

struct FlightSelection {
    let flight: Flight
    let title: String

    static func choose(_ flights: [Flight], now: Date, includeDemo: Bool) -> Self? {
        let ordered = flights.filter { includeDemo || $0.demo != true }.sorted {
            ($0.leg.departure ?? Leg.utc($0.date, "00:00") ?? .distantPast, $0.id) <
            ($1.leg.departure ?? Leg.utc($1.date, "00:00") ?? .distantPast, $1.id)
        }
        let activeStates = ["Подготовка", "Идет посадка", "Посадка завершена", "Вылетел", "Уход на запасной", "Задержан"]
        if let active = ordered.last(where: { flight in
            let leg = flight.continuation ?? flight.leg
            guard activeStates.contains(flight.status), leg.status != "Отменен", let start = leg.actualDeparture ?? leg.departure else { return false }
            let end = leg.arrival ?? start
            return now >= start.addingTimeInterval(-3 * 3600) && now <= end.addingTimeInterval(12 * 3600)
        }) {
            return Self(flight: active, title: "Рейс в работе")
        }
        if let current = ordered.last(where: { flight in
            guard flight.status == "Запланирован", let departure = flight.leg.departure,
                  let arrival = flight.leg.arrival else { return false }
            return departure <= now && now <= arrival
        }) {
            return Self(flight: current, title: "Рейс по расписанию")
        }
        if let upcoming = ordered.first(where: { $0.status == "Запланирован" && ($0.leg.departure ?? .distantPast) > now }) {
            return Self(flight: upcoming, title: "Ближайший рейс")
        }
        let latest = ordered.last { flight in
            (flight.leg.departure ?? Leg.utc(flight.date, "00:00") ?? .distantPast) <= now
        }
        return (latest ?? ordered.first).map { Self(flight: $0, title: "Последний рейс") }
    }
}

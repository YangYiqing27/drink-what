import Foundation

struct DrinkCategory: Identifiable, Codable, Hashable {
    let id: String
    var name: String
    var symbol: String
    var colorHex: String
    var typeNames: [String]
}

struct DrinkType: Identifiable, Codable, Hashable {
    let id: String
    var categoryID: String
    var name: String
    var caffeinePer100: Double?
    var caloriesPer100: Double?
}

struct DrinkRecord: Identifiable, Codable, Hashable {
    let id: UUID
    var date: Date
    var typeID: String
    var typeName: String
    var categoryID: String
    var amount: Int
    var caffeine: Double?
    var calories: Double?
    var note: String
}

struct DrinkData: Codable {
    var goal = 2_000
    var records: [DrinkRecord] = []
    var customTypes: [DrinkType] = []
}

final class DrinkStore: ObservableObject {
    @Published var data: DrinkData {
        didSet { save() }
    }

    let categories: [DrinkCategory] = [
        .init(id: "water", name: "水", symbol: "drop.fill", colorHex: "5E9EAF", typeNames: []),
        .init(id: "coffee", name: "咖啡", symbol: "cup.and.saucer.fill", colorHex: "A58A71", typeNames: []),
        .init(id: "milktea", name: "奶茶", symbol: "takeoutbag.and.cup.and.straw.fill", colorHex: "BF8E83", typeNames: []),
        .init(id: "juice", name: "果汁", symbol: "wineglass.fill", colorHex: "D09B58", typeNames: []),
        .init(id: "soda", name: "碳酸饮料", symbol: "waterbottle.fill", colorHex: "9593B7", typeNames: []),
        .init(id: "other", name: "其他", symbol: "cup.and.saucer.fill", colorHex: "799894", typeNames: [])
    ]

    init() {
        if let stored = UserDefaults.standard.data(forKey: "drink-what-data"),
           let saved = try? JSONDecoder().decode(DrinkData.self, from: stored) {
            data = saved
        } else {
            data = DrinkData()
        }
    }

    func types(for categoryID: String) -> [DrinkType] {
        let category = categories.first(where: { $0.id == categoryID })
        let builtIns = (category?.typeNames ?? []).enumerated().map {
            DrinkType(id: "\(categoryID):\($0.offset)", categoryID: categoryID, name: $0.element, caffeinePer100: nil, caloriesPer100: nil)
        }
        return builtIns + data.customTypes.filter { $0.categoryID == categoryID }
    }

    func category(for id: String) -> DrinkCategory {
        categories.first(where: { $0.id == normalizedCategoryID(id) }) ?? categories[0]
    }

    func normalizedCategoryID(_ id: String) -> String {
        switch id {
        case "tea", "milk": return "other"
        default: return id
        }
    }

    func records(on date: Date) -> [DrinkRecord] {
        data.records.filter { Calendar.current.isDate($0.date, inSameDayAs: date) }.sorted { $0.date > $1.date }
    }

    func total(on date: Date) -> Int {
        records(on: date).reduce(0) { $0 + $1.amount }
    }

    func save() {
        guard let encoded = try? JSONEncoder().encode(data) else { return }
        UserDefaults.standard.set(encoded, forKey: "drink-what-data")
    }

    func deleteCustomType(_ type: DrinkType) {
        data.customTypes.removeAll { $0.id == type.id }
    }
}

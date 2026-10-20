import SwiftUI

struct CalendarView: View {
    @EnvironmentObject private var store: DrinkStore
    @Binding var selectedDate: Date
    @Binding var showRecord: Bool
    @Binding var selectedCategory: String
    @State private var month = Date()

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 5), count: 7)
    private let calendar = Calendar.current

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    HStack {
                        Button { month = calendar.date(byAdding: .month, value: -1, to: month) ?? month } label: { Image(systemName: "chevron.left") }
                        Spacer()
                        Text(month.formatted(.dateTime.year().month(.wide))).font(.headline)
                        Spacer()
                        Button { month = calendar.date(byAdding: .month, value: 1, to: month) ?? month } label: { Image(systemName: "chevron.right") }
                    }
                    .padding(.horizontal, 6)
                    HStack {
                        ForEach(["一", "二", "三", "四", "五", "六", "日"], id: \.self) {
                            Text($0).font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                        }
                    }
                    HStack(spacing: 6) {
                        Text("少").font(.caption2).foregroundStyle(.secondary)
                        ForEach([0.08, 0.25, 0.45, 0.7, 0.95], id: \.self) {
                            RoundedRectangle(cornerRadius: 3).fill(AppTheme.green.opacity($0)).frame(width: 18, height: 12)
                        }
                        Text("多").font(.caption2).foregroundStyle(.secondary)
                        Spacer()
                    }
                    LazyVGrid(columns: columns, spacing: 5) {
                        ForEach(monthCells, id: \.self) { day in
                            CalendarDayCell(date: day, selectedDate: $selectedDate) {
                                selectedDate = day
                                showRecord = true
                            }
                        }
                    }
                    DayRecordsView(date: selectedDate)
                }
                .padding()
            }
            .background(AppTheme.background)
            .navigationTitle("饮水日历")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("今天") { month = Date(); selectedDate = Date() }
                }
            }
        }
    }

    private var monthCells: [Date] {
        guard let interval = calendar.dateInterval(of: .month, for: month),
              let firstWeek = calendar.dateInterval(of: .weekOfYear, for: interval.start),
              let lastDay = calendar.date(byAdding: .day, value: -1, to: interval.end),
              let lastWeek = calendar.dateInterval(of: .weekOfYear, for: lastDay) else { return [] }
        let count = calendar.dateComponents([.day], from: firstWeek.start, to: lastWeek.end).day ?? 0
        return (0..<count).compactMap { calendar.date(byAdding: .day, value: $0, to: firstWeek.start) }
    }
}

struct CalendarDayCell: View {
    @EnvironmentObject private var store: DrinkStore
    let date: Date
    @Binding var selectedDate: Date
    let action: () -> Void

    var body: some View {
        let records = store.records(on: date)
        let total = store.total(on: date)
        let intensity = min(Double(total) / Double(store.data.goal), 1)
        let heatOpacity = total == 0 ? 0.06 : 0.12 + intensity * 0.76
        let isDark = heatOpacity > 0.54
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Text(date.formatted(.dateTime.day())).font(.caption2.weight(.medium))
                    .foregroundStyle(isDark || Calendar.current.isDateInToday(date) ? .white : .secondary)
                    .frame(width: 20, height: 20)
                    .background(Calendar.current.isDateInToday(date) ? AppTheme.green : .clear, in: Circle())
                Spacer(minLength: 0)
                if !records.isEmpty {
                    Text("\(total) ml").font(.system(size: 8, weight: .medium))
                        .foregroundStyle(isDark ? .white : AppTheme.green)
                }
            }
            .padding(5)
            .frame(maxWidth: .infinity, minHeight: 78, alignment: .topLeading)
            .background(AppTheme.green.opacity(heatOpacity), in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Calendar.current.isDate(date, inSameDayAs: selectedDate) ? AppTheme.green : Color.clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .disabled(date > Date())
    }
}

struct ManageView: View {
    @EnvironmentObject private var store: DrinkStore
    @State private var showAdd = false
    @State private var categoryID = "coffee"

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("大类", selection: $categoryID) {
                        ForEach(store.categories) { Text($0.name).tag($0.id) }
                    }
                }
                ForEach(store.categories) { category in
                    Section {
                        ForEach(store.types(for: category.id)) { type in
                            HStack {
                                Text(type.name)
                                Spacer()
                                if let caffeine = type.caffeinePer100 { Text("\(caffeine.clean) mg/100ml").font(.caption).foregroundStyle(.secondary) }
                            }
                            .swipeActions {
                                Button(role: .destructive) {
                                    store.deleteCustomType(type)
                                } label: {
                                    Label("删除", systemImage: "trash")
                                }
                            }
                        }
                    } header: {
                        Label(category.name, systemImage: category.symbol)
                    }
                }
            }
            .navigationTitle("饮品管理")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showAdd) { AddDrinkBrandSheet(categoryID: categoryID) }
        }
    }
}

struct RecordSheet: View {
    @EnvironmentObject private var store: DrinkStore
    @Environment(\.dismiss) private var dismiss
    let categoryID: String
    let date: Date
    @State private var selectedCategory: String
    @State private var selectedTypeID: String
    @State private var amount = 250
    @State private var caffeine = ""
    @State private var calories = ""
    @State private var note = ""
    @State private var directEntry = false
    @State private var brand = ""
    @State private var showKeepPrompt = false
    @State private var pendingType: DrinkType?

    init(categoryID: String, date: Date) {
        self.categoryID = categoryID
        self.date = date
        _selectedCategory = State(initialValue: categoryID)
        _selectedTypeID = State(initialValue: "\(categoryID):0")
    }

    private var types: [DrinkType] { store.types(for: selectedCategory) }
    private var selectedType: DrinkType? { types.first(where: { $0.id == selectedTypeID }) ?? types.first }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("大类", selection: $selectedCategory) {
                        ForEach(store.categories) { Text($0.name).tag($0.id) }
                    }
                    if types.isEmpty || directEntry {
                        Toggle("列表中没有这个饮品", isOn: $directEntry)
                        TextField("品牌（必填）", text: $brand)
                    } else {
                        Picker("品牌", selection: $selectedTypeID) {
                            ForEach(types) { Text($0.name).tag($0.id) }
                        }
                        Button("列表中没有？直接输入") { directEntry = true }
                            .font(.caption)
                    }
                }
                Section("容量") {
                    Stepper("\(amount) ml", value: $amount, in: 1...10_000, step: 50)
                    HStack {
                        ForEach([100, 200, 250, 350, 500], id: \.self) { value in
                            Button("\(value)") { amount = value }.buttonStyle(.bordered)
                        }
                    }
                }
                Section("营养信息（可选）") {
                    TextField("咖啡因 mg", text: $caffeine).keyboardType(.decimalPad)
                    TextField("热量 kcal", text: $calories).keyboardType(.decimalPad)
                }
                Section("备注") { TextField("备注", text: $note) }
            }
            .navigationTitle("记录饮品")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("保存") { save() } }
            }
            .onChange(of: selectedCategory) { _, newValue in
                selectedTypeID = store.types(for: newValue).first?.id ?? ""
                caffeine = ""; calories = ""
                directEntry = store.types(for: newValue).isEmpty
            }
            .onChange(of: selectedTypeID) { _, newValue in
                guard let type = store.types(for: selectedCategory).first(where: { $0.id == newValue }) else { return }
                caffeine = type.caffeinePer100.map { String(($0 * Double(amount) / 100).clean) } ?? ""
                calories = type.caloriesPer100.map { String(($0 * Double(amount) / 100).clean) } ?? ""
            }
            .onChange(of: amount) { _, _ in
                guard let type = selectedType else { return }
                caffeine = type.caffeinePer100.map { String(($0 * Double(amount) / 100).clean) } ?? caffeine
                calories = type.caloriesPer100.map { String(($0 * Double(amount) / 100).clean) } ?? calories
            }
            .alert("加入饮品管理？", isPresented: $showKeepPrompt) {
                Button("保存到饮品管理") {
                    if let pendingType {
                        store.data.customTypes.append(pendingType)
                    }
                    dismiss()
                }
                Button("仅记录这一次", role: .cancel) { dismiss() }
            } message: {
                Text("以后可以在“饮品”里直接选择 \(pendingType?.name ?? "这杯饮品")。")
            }
        }
    }

    private func save() {
        guard date <= Date(), amount > 0 else { return }
        let trimmedBrand = brand.trimmingCharacters(in: .whitespacesAndNewlines)
        let adHocName = trimmedBrand
        let enteringDirect = directEntry || types.isEmpty
        let typeName = enteringDirect ? adHocName : selectedType?.name
        guard let typeName, !typeName.isEmpty else { return }
        let typeID = enteringDirect ? "ad-hoc-\(UUID().uuidString)" : (selectedType?.id ?? "")
        let record = DrinkRecord(id: UUID(), date: date, typeID: typeID, typeName: typeName, categoryID: selectedCategory, amount: amount, caffeine: Double(caffeine), calories: Double(calories), note: note)
        store.data.records.append(record)
        if enteringDirect {
            pendingType = DrinkType(id: UUID().uuidString, categoryID: selectedCategory, name: typeName, caffeinePer100: nil, caloriesPer100: nil)
            showKeepPrompt = true
        } else {
            dismiss()
        }
    }
}

struct AddDrinkBrandSheet: View {
    @EnvironmentObject private var store: DrinkStore
    @Environment(\.dismiss) private var dismiss
    let categoryID: String
    @State private var brand = ""
    @State private var caffeine = ""
    @State private var calories = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("品牌") {
                    TextField("品牌（例如：瑞幸）", text: $brand)
                    TextField("咖啡因 mg / 100 ml", text: $caffeine).keyboardType(.decimalPad)
                    TextField("热量 kcal / 100 ml", text: $calories).keyboardType(.decimalPad)
                }
            }
            .navigationTitle("添加品牌")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("添加") { add() }.disabled(brand.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
        }
    }

    private func add() {
        let cleanBrand = brand.trimmingCharacters(in: .whitespacesAndNewlines)
        let type = DrinkType(id: UUID().uuidString, categoryID: categoryID, name: cleanBrand, caffeinePer100: Double(caffeine), caloriesPer100: Double(calories))
        store.data.customTypes.append(type)
        dismiss()
    }
}

struct SettingsSheet: View {
    @EnvironmentObject private var store: DrinkStore
    @Environment(\.dismiss) private var dismiss
    @State private var goal = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("每日目标") {
                    TextField("目标容量（ml）", text: $goal).keyboardType(.numberPad)
                }
                Section {
                    Text("记录保存在这台 iPhone 上。之后接入账号和云同步后，可以跨设备使用。").font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("设置")
            .onAppear { goal = String(store.data.goal) }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") {
                        if let value = Int(goal), (100...10_000).contains(value) { store.data.goal = value }
                        dismiss()
                    }
                }
            }
        }
    }
}

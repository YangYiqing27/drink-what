import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: DrinkStore
    @State private var tab = 0
    @State private var selectedDate = Date()
    @State private var showRecord = false
    @State private var selectedCategory = "water"
    @State private var showSettings = false

    var body: some View {
        TabView(selection: $tab) {
            TodayView(selectedDate: $selectedDate, showRecord: $showRecord, selectedCategory: $selectedCategory, showSettings: $showSettings)
                .tabItem { Label("今天", systemImage: "sun.max") }.tag(0)
            CalendarView(selectedDate: $selectedDate, showRecord: $showRecord, selectedCategory: $selectedCategory)
                .tabItem { Label("日历", systemImage: "calendar") }.tag(1)
            ManageView()
                .tabItem { Label("饮品", systemImage: "cup.and.saucer") }.tag(2)
        }
        .sheet(isPresented: $showRecord) {
            RecordSheet(categoryID: selectedCategory, date: selectedDate)
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showSettings = true } label: { Image(systemName: "slider.horizontal.3") }
            }
        }
    }
}

struct TodayView: View {
    @EnvironmentObject private var store: DrinkStore
    @Binding var selectedDate: Date
    @Binding var showRecord: Bool
    @Binding var selectedCategory: String
    @Binding var showSettings: Bool

    private var total: Int { store.total(on: selectedDate) }
    private var percent: Double { min(Double(total) / Double(store.data.goal), 1) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    DatePicker("日期", selection: $selectedDate, in: ...Date(), displayedComponents: .date)
                        .datePickerStyle(.compact)
                        .labelsHidden()
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    ProgressCard(total: total, percent: percent, goal: store.data.goal) {
                        showSettings = true
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text("记录饮品").font(.title3.weight(.semibold))
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 78), spacing: 10)], spacing: 10) {
                            ForEach(store.categories) { category in
                                DrinkCategoryButton(category: category, count: store.types(for: category.id).count) {
                                    selectedCategory = category.id
                                    showRecord = true
                                }
                            }
                        }
                    }
                    DayRecordsView(date: selectedDate)
                }
                .padding()
            }
            .background(AppTheme.background)
            .navigationTitle("喝点什么")
        }
    }
}

struct ProgressCard: View {
    let total: Int
    let percent: Double
    let goal: Int
    let editGoal: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("饮品总量").font(.subheadline).foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(total)").font(.system(size: 48, weight: .semibold, design: .rounded)).foregroundStyle(AppTheme.green)
                Text("ml").foregroundStyle(.secondary)
            }
            ProgressView(value: percent)
                .tint(AppTheme.green)
            HStack {
                Text("目标 \(goal) ml").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button("修改目标", action: editGoal).font(.caption)
                Text("\(Int(percent * 100))%").font(.caption.weight(.medium)).foregroundStyle(AppTheme.green)
            }
        }
        .padding(20)
        .background(.white, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct DrinkCategoryButton: View {
    let category: DrinkCategory
    let count: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 7) {
                Image(systemName: category.symbol).font(.title3)
                Text(category.name).font(.caption.weight(.medium))
                Text("\(count) 种").font(.caption2).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 13)
            .background(Color(hex: category.colorHex).opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(Color(hex: category.colorHex))
        }
    }
}

struct DayRecordsView: View {
    @EnvironmentObject private var store: DrinkStore
    let date: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("当日记录").font(.title3.weight(.semibold))
            let records = store.records(on: date)
            if records.isEmpty {
                Text("今天还没有记录").font(.subheadline).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .center).padding(28)
            } else {
                ForEach(records) { record in
                    RecordRow(record: record)
                }
            }
        }
        .padding(18)
        .background(.white, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct RecordRow: View {
    @EnvironmentObject private var store: DrinkStore
    let record: DrinkRecord

    var body: some View {
        HStack(spacing: 11) {
            Image(systemName: store.category(for: record.categoryID).symbol)
                .frame(width: 36, height: 36)
                .background(AppTheme.paleGreen, in: RoundedRectangle(cornerRadius: 9))
            VStack(alignment: .leading, spacing: 4) {
                Text(record.typeName).font(.subheadline.weight(.medium))
                Text(record.date.formatted(date: .omitted, time: .shortened)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text("\(record.amount) ml").font(.subheadline.weight(.medium)).foregroundStyle(AppTheme.green)
        }
    }
}

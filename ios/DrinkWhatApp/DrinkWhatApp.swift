import SwiftUI

@main
struct DrinkWhatApp: App {
    @StateObject private var store = DrinkStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .tint(AppTheme.green)
        }
    }
}

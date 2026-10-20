# 喝点什么 iOS 版

这是原生 SwiftUI 版本，最低支持 iOS 17。

## 当前功能

- 今日饮品记录
- 水、咖啡、奶茶、果汁、碳酸饮料、其他六个大类
- 只记录到品牌，由你自己添加品牌，不预置品牌或具体口味
- 自定义容量、咖啡因、热量和备注
- 月历查看每天喝过的饮品
- 每日饮品总量和目标
- 自定义饮品品种
- 删除自己添加的品牌
- 本机本地保存

## 在 Xcode 中运行

打开 `ios/DrinkWhatApp.xcodeproj`。如果 Xcode 提示签名团队为空，在 target 的 **Signing & Capabilities** 中选择你的 Apple Developer Team，并确认 Bundle Identifier 唯一。

然后选择一个 iPhone 模拟器或连接自己的 iPhone，点击 Run。当前工程最低支持 iOS 17，仅面向 iPhone。

当前数据使用 `UserDefaults` 保存。正式发布前还需要加入账号、云同步、隐私政策、通知权限说明和 App Store 配置。

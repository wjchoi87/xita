// swift-tools-version: 5.9
import PackageDescription
import Foundation

// macOS Human Control Plane (v0.5 §4: SwiftUI = Native UI, product mechanics 는 Rust core)
let rustLib = ProcessInfo.processInfo.environment["XITA_RUST_LIB"]
    ?? "/Users/wjchoi/workspace/xita/rust/xita-core/target/release"

let package = Package(
    name: "XitaApp",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(path: "../XitaCoreBridge")
    ],
    targets: [
        .executableTarget(
            name: "XitaApp",
            dependencies: [
                .product(name: "XitaCoreBridge", package: "XitaCoreBridge")
            ],
            path: "Sources/XitaApp",
            linkerSettings: [
                .unsafeFlags(["-L", rustLib, "-lxita_core"]),
                .unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", rustLib]),
            ]
        ),
        .testTarget(
            name: "XitaAppTests",
            dependencies: ["XitaApp"],
            path: "Tests/XitaAppTests"
        ),
    ]
)
// swift-tools-version: 5.9
import PackageDescription
import Foundation

// xita-core(과 rust) cdylib 위치. 기본값은 로컬 release 빌드.
let rustLib = ProcessInfo.processInfo.environment["XITA_RUST_LIB"]
    ?? "/Users/wjchoi/workspace/xita/rust/xita-core/target/release"

let package = Package(
    name: "XitaCoreBridge",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "XitaCoreBridge", targets: ["XitaCoreBridge"])
    ],
    targets: [
        .target(name: "CXitaCore"),
        .target(
            name: "XitaCoreBridge",
            dependencies: ["CXitaCore"],
            linkerSettings: [
                .unsafeFlags(["-L", rustLib, "-lxita_core"]),
                .unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", rustLib]),
            ]
        ),
        .testTarget(name: "XitaCoreBridgeTests", dependencies: ["XitaCoreBridge"]),
    ]
)
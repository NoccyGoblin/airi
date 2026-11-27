plugins {
    id("com.android.application")
}

/** The toolchain folder of the repository. See README.md. */
val tools = rootDir.resolve("../../tools")

android {
    namespace = "dev.fairy.companion"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.fairy.companion"
        minSdk = 29
        targetSdk = 35
        versionCode = 3
        versionName = "0.3.0"
        // Modern Android phones only, so the keyword spotter's native code stays small.
        ndk { abiFilters += "arm64-v8a" }
    }

    // The wake word model. build-app.cmd copies its files here from the downloaded model pack.
    sourceSets["main"].assets.srcDir(tools.resolve("sherpa/assets"))

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // On-device keyword spotting: sherpa-onnx (Apache-2.0), from its GitHub release. See README.md.
    implementation(files(tools.resolve("sherpa/sherpa-onnx.aar")))
    // The library is written in Kotlin, so it needs the Kotlin standard library at run time.
    implementation("org.jetbrains.kotlin:kotlin-stdlib:2.0.21")
}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.melodica.ai"
    compileSdk = 36
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    defaultConfig {
        applicationId = "com.melodica.ai"
        minSdk = 26
        targetSdk = 36
        versionCode = 14
        versionName = "1.4.0"
        val apiUrl = providers.gradleProperty("MELODICA_API_BASE_URL").orNull ?: "https://melodica-ia-production.up.railway.app"
        val apiEnabled = providers.gradleProperty("MELODICA_API_ENABLED").orNull?.toBooleanStrictOrNull() ?: true
        buildConfigField("String", "MELODICA_API_BASE_URL", "\"${apiUrl}\"")
        buildConfigField("boolean", "MELODICA_API_ENABLED", apiEnabled.toString())
    }
    buildFeatures { buildConfig = true }
    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

dependencies {
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation(platform("androidx.compose:compose-bom:2026.06.01"))
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.9.8")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.android.billingclient:billing-ktx:9.1.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
}

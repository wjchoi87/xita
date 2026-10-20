-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses

# --- AdMob ---
-keep class com.google.android.gms.ads.** { *; }
-dontwarn com.google.android.gms.**

# --- Room / WorkManager ---
# play-services-ads가 WorkManager를 전이 의존성으로 끌고 온다.
# WorkManager는 내부적으로 Room을 쓰고, Room은 "<DB클래스>_Impl" 이라는 이름을
# 리플렉션으로 찾아 인스턴스를 만든다. minify가 이 이름을 난독화하면
# 런타임에 "Failed to create an instance of ... WorkDatabase" 로 즉시 죽는다.
#
# 디버그 빌드에서는 절대 재현되지 않는다. release 빌드를 실제로 실행해봐야 발견된다.
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keepclassmembers class * extends androidx.room.RoomDatabase { public <init>(); }
-keep class androidx.room.RoomDatabase { *; }
-keep class androidx.work.impl.** { *; }
-dontwarn androidx.room.**
-dontwarn androidx.work.**

# --- Compose ---
-dontwarn androidx.compose.**

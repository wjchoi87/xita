module.exports = function (api) {
  api.cache(true)
  // expo-router/babel 은 SDK 50 부터 babel-preset-expo 에 포함 — 별도 플러그인은 폐기 경고만 낸다
  return {
    presets: ['babel-preset-expo'],
  }
}

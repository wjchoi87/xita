import { Tabs } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { useSyncScheduler } from '@/hooks/useSyncScheduler'
import { store } from '@/state/store'

export default function RootLayout() {
  useEffect(() => {
    void store.init()
  }, [])
  // foreground → pull / pending → flush (v0.4 §13 기본 동작, 폴링 기반)
  useSyncScheduler()

  return (
    <>
      <StatusBar style="auto" />
      <Tabs>
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="capture" options={{ title: 'Capture' }} />
        <Tabs.Screen name="products" options={{ title: 'Products' }} />
      </Tabs>
    </>
  )
}
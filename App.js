/**
 * App.js — KehadiranPro root
 *
 * Hermes is the engine this app is built for. The check below runs exactly
 * once at startup and prints to the Metro console / `adb logcat`:
 *
 *   Hermes ACTIVE            <- expected on both debug and release
 *   Hermes OFF — JSC in use  <- engine misconfigured, investigate
 *
 * The version string comes straight from the bytecode VM, so it also proves
 * the JS bundle that is running was compiled to Hermes bytecode (release).
 */

import React, {useEffect} from 'react';
import {StatusBar, StyleSheet} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import CheckIn from './src/screens/CheckIn';
import Rekod from './src/screens/Rekod';
import Eksport from './src/screens/Eksport';
import Ringkasan from './src/screens/Ringkasan';
import {COLORS, FONT} from './src/theme';

// --- Hermes startup check (required) ---------------------------------------
console.log(global.HermesInternal ? 'Hermes ACTIVE' : 'Hermes OFF');
const hermes = global.HermesInternal;
if (hermes && typeof hermes.getRuntimeProperties === 'function') {
  // e.g. "Hermes 0.12.0" — proves the bytecode VM, not JSC, is executing us.
  try {
    const props = hermes.getRuntimeProperties();
    console.log('Hermes version:', props['hermes.version'] || 'unknown');
  } catch (error) {
    console.log('Hermes version: unavailable');
  }
}
// ---------------------------------------------------------------------------

function makeTabIcon(name) {
  // Defined at module scope on purpose: React Navigation treats tabBarIcon as a
  // component, so an inline arrow would remount the icon on every render.
  return function TabIcon({color, size}) {
    return (
      <MaterialIcons name={name} size={size ? size + 2 : 26} color={color} />
    );
  };
}

const Tab = createBottomTabNavigator();

// Tab icons: MaterialIcons names, resolved at build time (no dynamic require).
const ICONS = {
  Daftar: 'how-to-reg',
  Rekod: 'list-alt',
  Eksport: 'file-download',
  Ringkasan: 'auto-awesome',
};

const TITLES = {
  Daftar: 'KehadiranPro',
  Rekod: 'Rekod Kehadiran',
  Eksport: 'Eksport Rekod',
  Ringkasan: 'Ringkasan AI',
};

export default function App() {
  useEffect(() => {
    // One-line breadcrumb in logcat so a field tester can confirm a cold start
    // reached the first render.
    console.log('[KehadiranPro] sedia');
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.primaryDark}
      />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({route}) => ({
            headerStyle: styles.header,
            headerTintColor: COLORS.white,
            headerTitleStyle: styles.headerTitle,
            headerTitle: TITLES[route.name] || route.name,
            tabBarActiveTintColor: COLORS.primary,
            tabBarInactiveTintColor: COLORS.textMuted,
            tabBarStyle: styles.tabBar,
            tabBarLabelStyle: styles.tabLabel,
            tabBarIcon: makeTabIcon(ICONS[route.name]),
          })}>
          <Tab.Screen name="Daftar" component={CheckIn} />
          <Tab.Screen name="Rekod" component={Rekod} />
          <Tab.Screen name="Eksport" component={Eksport} />
          <Tab.Screen name="Ringkasan" component={Ringkasan} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.primary,
    elevation: 0,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: FONT.title,
    fontWeight: '700',
  },
  tabBar: {
    height: 70,
    paddingBottom: 10,
    paddingTop: 6,
    borderTopColor: COLORS.border,
  },
  tabLabel: {
    fontSize: FONT.body, // 16sp minimum, per the accessibility brief
  },
});

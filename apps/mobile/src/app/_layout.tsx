import { FrankRuhlLibre_500Medium } from '@expo-google-fonts/frank-ruhl-libre/500Medium';
import { FrankRuhlLibre_700Bold } from '@expo-google-fonts/frank-ruhl-libre/700Bold';
import { FrankRuhlLibre_900Black } from '@expo-google-fonts/frank-ruhl-libre/900Black';
import { Rubik_400Regular } from '@expo-google-fonts/rubik/400Regular';
import { Rubik_500Medium } from '@expo-google-fonts/rubik/500Medium';
import { Rubik_600SemiBold } from '@expo-google-fonts/rubik/600SemiBold';
import { Rubik_700Bold } from '@expo-google-fonts/rubik/700Bold';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, AppState, Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MonetizationHost } from '@/components/economy/MonetizationHost';
import { NoAdsFab } from '@/components/economy/NoAdsFab';
import { applyDirection } from '@/lib/direction';
import { currentLocale, loadLocale, onLocaleSaved, setLocale, t, useLocale, useLocaleValue } from '@/lib/i18n';
import { queryClient } from '@/lib/queries';
import { loadPrefs } from '@/lib/prefs';
import { api, bootSession, useSession } from '@/lib/session';
import { prepareSounds } from '@/lib/sound';
import { ThemeProvider, useTheme } from '@/theme/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Na web, o login do Google ou do Facebook volta numa janela à parte: ela entrega o
// resultado à janela do jogo e fecha.
if (Platform.OS === 'web') WebBrowser.maybeCompleteAuthSession();

// No celular, "voltar para o app" conta como foco: os dados da partida são atualizados.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

function Navigator() {
  const { colors } = useTheme();
  const signedIn = useSession((s) => s.status === 'signedIn');

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      {/* Sem sessão, as telas do jogo levam às boas-vindas; com sessão, as de entrada levam ao início. */}
      <Stack.Protected guard={signedIn} redirectTo="/welcome">
        <Stack.Screen name="index" />
        <Stack.Screen name="game/[id]/index" />
        <Stack.Screen name="game/[id]/question" options={{ gestureEnabled: false, animation: 'fade_from_bottom' }} />
        <Stack.Screen name="join" />
        <Stack.Screen name="ranking" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="account" />
        <Stack.Screen name="journey/index" />
        <Stack.Screen name="journey/parasha/[id]" />
        <Stack.Screen name="journey/run/[id]" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="journey/shop" />
        <Stack.Screen name="puzzle/index" />
        <Stack.Screen name="puzzle/[level]" options={{ gestureEnabled: false, animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo="/">
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
    FrankRuhlLibre_500Medium,
    FrankRuhlLibre_700Bold,
    FrankRuhlLibre_900Black,
  });
  const status = useSession((s) => s.status);
  const [localeLoaded, setLocaleLoaded] = useState(false);
  const locale = useLocaleValue();
  const ready = (fontsLoaded || !!fontError) && status !== 'starting' && localeLoaded;

  useEffect(() => {
    void loadLocale().finally(() => {
      applyDirection(currentLocale(), { reload: false });
      setLocaleLoaded(true);
    });
    // Trocar para ou do hebraico vira a tela inteira (no celular, recarrega o app).
    const offSaved = onLocaleSaved((l) =>
      applyDirection(l, {
        reload: true,
        onNeedsRestart: () => Alert.alert(t('Direção da tela'), t('Feche e abra o app para a nova direção da tela valer em todas as telas.')),
      }),
    );
    void bootSession();
    void loadPrefs();
    prepareSounds();
    return offSaved;
  }, []);

  // Idioma do aparelho e da conta andam juntos: a escolha feita aqui vale para o servidor,
  // e numa conta aberta em outro aparelho vale a que já estava na conta.
  useEffect(() => {
    if (status !== 'signedIn' || !localeLoaded) return;
    let alive = true;
    void api.me
      .get()
      .then((me) => {
        if (!alive || me.locale === currentLocale()) return;
        if (useLocale.getState().chosen) void api.me.setLocale(currentLocale()).catch(() => undefined);
        else setLocale(me.locale);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [status, localeLoaded]);

  useEffect(() => {
    if (status === 'signedOut') queryClient.clear();
  }, [status]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            {/* Trocar o idioma redesenha todas as telas no idioma novo. */}
            <Navigator key={locale} />
            {/* Fase 9: anúncios, presente da pausa, compras e o botão "Sem anúncios", por cima de tudo. */}
            <NoAdsFab key={`fab-${locale}`} />
            <MonetizationHost key={`host-${locale}`} />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

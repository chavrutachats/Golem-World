/**
 * "Contas conectadas" no perfil: liga ou desliga Google, Apple e Facebook. Para o
 * convidado, os botões ficam dentro de "Guarde seu progresso", antes do e-mail e senha:
 * ligar um login já vira conta completa, com pontos, moedas e itens.
 */
import { useQueryClient } from '@tanstack/react-query';
import type { MeResponse, SocialProvider } from '@trivia/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components/ui/Button';
import { T } from '@/components/ui/Text';
import { confirmAction } from '@/lib/feedback';
import { msg, t } from '@/lib/i18n';
import { errorMessage, keys } from '@/lib/queries';
import { api } from '@/lib/session';
import { SOCIAL_NAMES, signInWith, useSocialProviders } from '@/lib/social';
import { useTheme } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';
import { AppleButton } from './AppleButton';
import { ProviderButton } from './ProviderButton';

const CONNECT: Readonly<Record<SocialProvider, string>> = {
  google: msg('Conectar o Google'),
  apple: msg('Conectar a Apple'),
  facebook: msg('Conectar o Facebook'),
};

export function ConnectedAccounts({ me, guest }: { me: MeResponse | undefined; guest: boolean }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const available = useSocialProviders();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const linked = me?.identities ?? [];
  const toLink = (available.data ?? []).filter((p) => !linked.includes(p));
  if (!linked.length && !toLink.length) return null;

  const connect = async (provider: SocialProvider) => {
    setBusy(provider);
    setMessage(null);
    try {
      if (await signInWith(provider)) {
        await qc.invalidateQueries({ queryKey: keys.me });
        setMessage({ ok: true, text: t('Login com {provider} conectado. Agora você também entra por ele.', { provider: SOCIAL_NAMES[provider] }) });
      }
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (provider: SocialProvider) => {
    const ok = await confirmAction(
      t('Desconectar o login com {provider}?', { provider: SOCIAL_NAMES[provider] }),
      t('Você deixa de entrar com {provider} nesta conta. Seus pontos e itens continuam aqui.', { provider: SOCIAL_NAMES[provider] }),
      t('Desconectar'),
      true,
    );
    if (!ok) return;
    setBusy(provider);
    setMessage(null);
    try {
      qc.setQueryData(keys.me, await api.me.unlink(provider));
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.wrap, !guest && styles.section]} testID="connected-accounts">
      {guest ? null : (
        <>
          <T variant="title" display accessibilityRole="header">
            {t('Contas conectadas')}
          </T>
          <T muted>{t('Entre na sua conta com qualquer um destes serviços.')}</T>
        </>
      )}
      {linked.map((p) => (
        <View key={p} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line }]} testID={`linked-${p}`}>
          <Ionicons name={p === 'google' ? 'logo-google' : p === 'apple' ? 'logo-apple' : 'logo-facebook'} size={20} color={colors.ink} />
          <T weight="bold" style={styles.flex}>
            {SOCIAL_NAMES[p]}
          </T>
          <Button label={t('Desconectar')} variant="ghost" onPress={() => void disconnect(p)} loading={busy === p} disabled={!!busy} />
        </View>
      ))}
      {toLink.map((p) => {
        const Btn = p === 'apple' ? AppleButton : ProviderButton;
        return <Btn key={p} provider={p} label={t(CONNECT[p])} onPress={() => void connect(p)} busy={busy === p} disabled={!!busy && busy !== p} />;
      })}
      {message ? (
        <T variant="small" color={message.ok ? colors.success : colors.danger} accessibilityLiveRegion="polite">
          {message.text}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  section: { marginTop: space.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingStart: space.lg, paddingEnd: space.sm, minHeight: 52, borderRadius: radius.control, borderWidth: 1 },
  flex: { flex: 1 },
});

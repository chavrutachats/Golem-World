import { useQueryClient } from '@tanstack/react-query';
import { DisplayNameSchema, PASSWORD_MIN_LENGTH, passwordProblem } from '@trivia/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { LanguagePicker } from '@/components/LanguagePicker';
import { TopBar } from '@/components/TopBar';
import { ConnectedAccounts } from '@/components/social/ConnectedAccounts';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { confirmAction } from '@/lib/feedback';
import { setPref, usePrefs } from '@/lib/prefs';
import { play } from '@/lib/sound';
import { errorMessage, keys, useMe } from '@/lib/queries';
import { api, updateUser, useSession } from '@/lib/session';
import { SOCIAL_NAMES, useSocialProviders } from '@/lib/social';
import { useTheme } from '@/theme/theme';
import { brand, radius, space } from '@/theme/tokens';
import { currentLocale, formatNumber, t } from '@/lib/i18n';

function StatRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { borderColor: colors.line }]}>
      <T style={styles.flex}>{label}</T>
      <T weight="bold" style={styles.tabular}>
        {value}
      </T>
    </View>
  );
}

export default function Profile() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const user = useSession((s) => s.user)!;
  const me = useMe();
  const soundOn = usePrefs((p) => p.sound);
  const socialReady = !!useSocialProviders().data?.length;

  const [name, setName] = useState(user.displayName);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingName, setSavingName] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regError, setRegError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  useEffect(() => setName(user.displayName), [user.displayName]);

  async function saveName() {
    const parsed = DisplayNameSchema.safeParse(name.trim());
    if (!parsed.success) {
      setNameMsg({ ok: false, text: t(parsed.error.issues[0]?.message ?? 'Escolha outro nome.') });
      return;
    }
    setSavingName(true);
    try {
      const updated = await api.me.rename(parsed.data);
      updateUser({ displayName: updated.displayName });
      qc.setQueryData(keys.me, updated);
      setNameMsg({ ok: true, text: t('Nome salvo.') });
    } catch (e) {
      setNameMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setSavingName(false);
    }
  }

  async function register() {
    if (!email.trim()) {
      setRegError(t('Informe um e-mail.'));
      return;
    }
    const weak = passwordProblem(password, { email: email.trim(), displayName: user.displayName });
    if (weak) {
      setRegError(t(weak));
      return;
    }
    setRegistering(true);
    setRegError(null);
    try {
      await api.auth.register({ email: email.trim(), password, displayName: user.displayName, locale: currentLocale() });
      void qc.invalidateQueries({ queryKey: keys.me });
      setEmail('');
      setPassword('');
    } catch (e) {
      setRegError(errorMessage(e));
    } finally {
      setRegistering(false);
    }
  }

  async function logout() {
    const ok = await confirmAction(
      t('Sair da conta?'),
      user.isGuest
        ? t('Você está jogando como convidado. Se sair sem criar uma conta, não terá como voltar a esta conta e aos seus pontos.')
        : me.data && !me.data.hasPassword && me.data.identities.length
          ? t('Você pode entrar de novo com: {providers}.', { providers: me.data.identities.map((p) => SOCIAL_NAMES[p]).join(', ') })
          : t('Você pode entrar de novo com seu e-mail e senha.'),
      t('Sair'),
      user.isGuest,
    );
    if (ok) await api.auth.logout();
  }

  const stats = me.data?.stats;
  const accuracy = stats && stats.answered ? `${Math.round((stats.correct / stats.answered) * 100)}%` : '–';

  return (
    <Screen scroll>
      <TopBar title={t('Seu perfil')} />

      <View style={styles.section}>
        <TextField
          label={t('Seu nome no jogo')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setNameMsg(null);
          }}
          maxLength={24}
          returnKeyType="done"
          onSubmitEditing={saveName}
          {...(nameMsg && !nameMsg.ok ? { error: nameMsg.text } : nameMsg ? { hint: nameMsg.text } : {})}
        />
        <Button label={t('Salvar nome')} variant="secondary" onPress={saveName} loading={savingName} disabled={name.trim() === user.displayName} />
      </View>

      <T variant="title" display style={styles.heading} accessibilityRole="header">
        {t('Seu jogo')}
      </T>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <StatRow label={t('Pontos')} value={formatNumber(user.totalPoints)} />
        <StatRow label={t('Partidas terminadas')} value={stats ? formatNumber(stats.gamesPlayed) : '–'} />
        <StatRow label={t('Vitórias')} value={stats ? formatNumber(stats.wins) : '–'} />
        <StatRow label={t('Perguntas respondidas')} value={stats ? formatNumber(stats.answered) : '–'} />
        <StatRow label={t('Acertos')} value={accuracy} />
      </View>

      {user.isGuest ? (
        <>
          <T variant="title" display style={styles.heading} accessibilityRole="header">
            {t('Guarde seu progresso')}
          </T>
          <View style={styles.section}>
            <T muted>{t('Com uma conta, você joga em outro aparelho sem perder seus pontos e partidas.')}</T>
            <ConnectedAccounts me={me.data} guest />
            {socialReady ? (
              <T variant="small" muted align="center">
                {t('ou com e-mail e senha')}
              </T>
            ) : null}
            <TextField label={t('E-mail')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <TextField
              label={t('Senha')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              hint={t('Pelo menos {n} caracteres. Uma frase com algumas palavras é fácil de lembrar e difícil de adivinhar.', { n: PASSWORD_MIN_LENGTH })}
              error={regError}
            />
            <Button label={t('Criar conta')} onPress={register} loading={registering} />
          </View>
        </>
      ) : (
        <>
          {me.data?.email ? (
            <T muted style={styles.heading}>
              {t('Conta: {email}', { email: me.data.email })}
            </T>
          ) : null}
          <ConnectedAccounts me={me.data} guest={false} />
        </>
      )}

      <View style={[styles.card, styles.languageRow, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <LanguagePicker
          onChange={(locale) => {
            // O servidor passa a montar as perguntas no idioma novo.
            void api.me.setLocale(locale).then((updated) => qc.setQueryData(keys.me, updated)).catch(() => undefined);
            void qc.invalidateQueries();
          }}
        />
        <T variant="small" muted>
          {t('Vale para os menus e para as perguntas, alternativas e explicações do Golem World e do sevivon.')}
        </T>
      </View>

      <View style={[styles.card, styles.soundRow, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.flex}>
          <T weight="bold">{t('Sons do jogo')}</T>
          <T variant="small" muted>
            {t('Sevivon, acertos e erros. Seguem o modo silencioso do celular.')}
          </T>
        </View>
        <Switch
          accessibilityLabel={t('Sons do jogo')}
          value={soundOn}
          onValueChange={(on) => {
            setPref('sound', on);
            if (on) play('correct', 0.6);
          }}
          trackColor={{ true: brand.gold, false: colors.line }}
          thumbColor="#FFFFFF"
        />
      </View>

      <T variant="title" display style={styles.heading} accessibilityRole="header">
        {t('Sobre as perguntas')}
      </T>
      <T muted>
        {t(
          'As perguntas saem dos textos do acervo aberto do Sefaria, cada um com sua própria licença. Depois de responder, você vê o trecho que comprova a resposta e pode denunciar qualquer problema. Quando o Sefaria não tem tradução com licença aberta no seu idioma, o texto é traduzido automaticamente a partir do original, e a fonte avisa. Este app não é um produto do Sefaria.',
        )}
      </T>

      <Button label={t('Conta e segurança')} variant="secondary" onPress={() => router.push('/account')} style={styles.account} />
      <Button label={t('Sair da conta')} variant="danger" onPress={logout} style={styles.logout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  section: { gap: space.md, marginTop: space.lg },
  heading: { marginTop: space.xxl, marginBottom: space.sm },
  card: { borderRadius: radius.surface, borderWidth: 1, overflow: 'hidden' },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, marginTop: space.md },
  languageRow: { gap: space.sm, padding: space.lg, marginTop: space.xxl },
  stat: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  account: { marginTop: space.xxl },
  logout: { marginTop: space.md, marginBottom: space.xxxl },
});

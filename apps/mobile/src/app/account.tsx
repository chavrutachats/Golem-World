/**
 * Conta e segurança: trocar a senha, sair de todos os aparelhos e excluir a conta.
 */
import { PASSWORD_MIN_LENGTH, passwordProblem } from '@trivia/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { confirmAction } from '@/lib/feedback';
import { errorMessage, useMe } from '@/lib/queries';
import { api, useSession } from '@/lib/session';
import { useTheme } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';
import { t } from '@/lib/i18n';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <T variant="title" display accessibilityRole="header">
        {title}
      </T>
      {children}
    </View>
  );
}

export default function Account() {
  const { colors } = useTheme();
  const user = useSession((s) => s.user)!;
  const me = useMe();
  // Conta criada pelo Google, Apple ou Facebook não tem senha: nada de "trocar senha" nem de senha para excluir.
  const hasPassword = !user.isGuest && me.data?.hasPassword !== false;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [changing, setChanging] = useState(false);

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function changePassword() {
    if (!current) {
      setPwMsg({ ok: false, text: t('Informe a senha atual.') });
      return;
    }
    const weak = passwordProblem(next, { email: me.data?.email, displayName: user.displayName });
    if (weak) {
      setPwMsg({ ok: false, text: t(weak) });
      return;
    }
    setChanging(true);
    setPwMsg(null);
    try {
      await api.me.changePassword(current, next);
      setCurrent('');
      setNext('');
      setPwMsg({ ok: true, text: t('Senha trocada. Os outros aparelhos foram desconectados.') });
    } catch (e) {
      setPwMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setChanging(false);
    }
  }

  async function logoutAll() {
    const ok = await confirmAction(
      t('Sair de todos os aparelhos?'),
      hasPassword
        ? t('Sua conta será desconectada em todos os aparelhos, inclusive neste. Para voltar, entre com seu e-mail e senha.')
        : t('Sua conta será desconectada em todos os aparelhos, inclusive neste. Para voltar, entre de novo com o mesmo serviço.'),
      t('Sair de todos'),
      true,
    );
    if (!ok) return;
    setLoggingOut(true);
    try {
      await api.auth.logoutAll();
    } catch (e) {
      setLoggingOut(false);
      setPwMsg({ ok: false, text: errorMessage(e) });
    }
  }

  async function deleteAccount() {
    if (hasPassword && !deletePassword) {
      setDeleteError(t('Confirme com a sua senha.'));
      return;
    }
    const ok = await confirmAction(
      t('Excluir a conta de vez?'),
      t('Seus dados serão apagados e não há como desfazer. Partidas em andamento terminam com vitória do adversário.'),
      t('Excluir'),
      true,
    );
    if (!ok) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.me.deleteAccount(hasPassword ? deletePassword : undefined);
      // A sessão termina e o app volta para a tela de boas-vindas.
    } catch (e) {
      setDeleteError(errorMessage(e));
      setDeleting(false);
    }
  }

  return (
    <Screen scroll>
      <TopBar title={t('Conta e segurança')} />

      {user.isGuest ? (
        <T muted style={styles.intro}>
          {t('Você joga como convidado: a conta existe só neste aparelho e não tem senha. Para jogar em outro aparelho, crie uma conta no seu perfil.')}
        </T>
      ) : (
        <>
          {hasPassword ? (
            <Section title={t('Trocar senha')}>
              <TextField
                label={t('Senha atual')}
                value={current}
                onChangeText={setCurrent}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
              />
              <TextField
                label={t('Senha nova')}
                value={next}
                onChangeText={(value) => {
                  setNext(value);
                  setPwMsg(null);
                }}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                {...(pwMsg && !pwMsg.ok ? { error: pwMsg.text } : { hint: pwMsg?.text ?? t('Pelo menos {n} caracteres.', { n: PASSWORD_MIN_LENGTH }) })}
              />
              <Button label={t('Trocar senha')} onPress={changePassword} loading={changing} />
            </Section>
          ) : null}

          <Section title={t('Aparelhos conectados')}>
            <T muted>{t('Perdeu o celular ou entrou num aparelho emprestado? Desconecte a conta de todos de uma vez.')}</T>
            <Button label={t('Sair de todos os aparelhos')} variant="secondary" onPress={logoutAll} loading={loggingOut} />
          </Section>
        </>
      )}

      <View style={[styles.danger, { borderColor: colors.danger, backgroundColor: colors.surface }]}>
        <T variant="title" display accessibilityRole="header">
          {t('Excluir conta')}
        </T>
        <T muted>
          {user.isGuest
            ? t('Apaga seu nome no jogo, seus pontos e os comentários das suas denúncias, e tira você do ranking. Não há como desfazer.')
            : t('Apaga seu e-mail, sua senha, seu nome no jogo, seus pontos e os comentários das suas denúncias, e tira você do ranking. Não há como desfazer.')}
        </T>
        {!hasPassword ? null : (
          <TextField
            label={t('Sua senha')}
            value={deletePassword}
            onChangeText={(value) => {
              setDeletePassword(value);
              setDeleteError(null);
            }}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            error={deleteError}
          />
        )}
        {!hasPassword && deleteError ? (
          <T variant="caption" color={colors.danger} accessibilityLiveRegion="polite">
            {deleteError}
          </T>
        ) : null}
        <Button label={t('Excluir minha conta')} variant="danger" onPress={deleteAccount} loading={deleting} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginTop: space.lg },
  section: { gap: space.md, marginTop: space.xxl },
  danger: { gap: space.md, marginTop: space.xxl, marginBottom: space.xxxl, padding: space.lg, borderWidth: 1.5, borderRadius: radius.surface },
});

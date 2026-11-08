import { REPORT_REASONS } from '@trivia/shared';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';
import { reportReasonLabel } from '@/lib/copy';
import { errorMessage } from '@/lib/queries';
import { api } from '@/lib/session';
import { Button } from './ui/Button';
import { T } from './ui/Text';
import { TextField } from './ui/TextField';
import { t } from '@/lib/i18n';

type Reason = (typeof REPORT_REASONS)[number];

export function ReportSheet({ playId, visible, onClose }: { playId: string; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const [reason, setReason] = useState<Reason | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function send() {
    if (!reason) return;
    setSending(true);
    setError(null);
    try {
      await api.reportQuestion({ playId, reason, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <T variant="title" display style={styles.flex}>
              {done ? t('Denúncia enviada') : t('Denunciar pergunta')}
            </T>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Fechar')} onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={28} color={colors.ink} />
            </Pressable>
          </View>
          {done ? (
            <>
              <T muted>{t('A pergunta vai para a revisão. Obrigado por ajudar a manter o jogo fiel aos textos.')}</T>
              <Button label={t('Fechar')} onPress={onClose} />
            </>
          ) : (
            <>
              <T muted>{t('O que há de errado com ela?')}</T>
              <View style={styles.reasons} accessibilityRole="radiogroup">
                {REPORT_REASONS.map((r) => {
                  const selected = reason === r;
                  return (
                    <Pressable
                      key={r}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => setReason(r)}
                      style={[styles.reason, { borderColor: selected ? colors.focus : colors.line, backgroundColor: colors.surface }]}
                    >
                      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.focus : colors.inkMuted} />
                      <T style={styles.flex}>{reportReasonLabel(r)}</T>
                    </Pressable>
                  );
                })}
              </View>
              <TextField label={t('Detalhes (opcional)')} value={comment} onChangeText={setComment} maxLength={500} multiline />
              {error ? <T color={colors.danger}>{error}</T> : null}
              <Button label={t('Enviar denúncia')} onPress={send} disabled={!reason} loading={sending} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,16,40,0.55)' },
  sheet: {
    borderTopLeftRadius: radius.piece,
    borderTopRightRadius: radius.piece,
    padding: space.xl,
    paddingBottom: space.xxxl,
    gap: space.lg,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  reasons: { gap: space.sm },
  reason: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1.5, borderRadius: radius.control, padding: space.md },
});

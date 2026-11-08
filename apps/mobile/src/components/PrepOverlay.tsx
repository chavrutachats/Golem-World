/**
 * Tela de preparo (Fase 8): enquanto o servidor traduz os textos da fase (ou as
 * perguntas da roleta) para o idioma do jogador, o Golem ensina a jogar. Só aparece
 * quando há algo a traduzir; depois de feito, a mesma fase abre na hora para todos.
 */
import { DIFFICULTIES, DIFFICULTY_LABELS_PT, LOCALE_INFO, type PrepStatus } from '@trivia/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { StarIcon } from '@/components/game/icons';
import { TutorialStage } from '@/components/three/TutorialStage';
import { Hearts, GameButton, GamePanel } from '@/components/game/GameUI';
import { GameText } from '@/components/game/GameText';
import { T } from '@/components/ui/Text';
import { currentLocale, msg, t, tc } from '@/lib/i18n';
import type { GolemLook } from '@trivia/shared';
import { g as px } from '@/theme/game';

type Mode = 'journey' | 'wheel';

interface Tip {
  text: string;
  scene: 'jump' | 'hurt' | 'level' | 'source' | 'tracks' | 'wheel' | 'crown' | 'lives';
}

/** Dicas em português; traduzidas com t() ao mostrar. */
const TIPS: Readonly<Record<Mode, readonly Tip[]>> = {
  journey: [
    { scene: 'jump', text: msg('Responda certo e rápido: o Golem dá um pulo perfeito sobre o obstáculo.') },
    { scene: 'hurt', text: msg('Errou? O Golem tropeça e perde um coração. Sem corações, a fase recomeça.') },
    { scene: 'level', text: msg('Quanto mais rápido você acerta, mais difíceis ficam as próximas perguntas.') },
    { scene: 'source', text: msg('Depois de cada resposta aparece a fonte. Toque nela para ler o texto inteiro no Sefaria.') },
    { scene: 'tracks', text: msg('Complete a Torá de uma parashá e abrem os caminhos: Mishná, Talmud, Midrash, comentaristas, Cabalá e mitzvot.') },
  ],
  wheel: [
    { scene: 'wheel', text: msg('Gire o sevivon e responda a pergunta da categoria sorteada. Junte os 6 selos para vencer.') },
    { scene: 'crown', text: msg('Três acertos seguidos enchem a Coroa: aí você escolhe um selo para disputar.') },
    { scene: 'lives', text: msg('Cada erro gasta uma vida e passa a vez. As vidas voltam sozinhas, uma a cada 10 minutos.') },
    { scene: 'source', text: msg('Depois de cada resposta aparece a fonte. Toque nela para ler o texto inteiro no Sefaria.') },
  ],
};

const TIP_MS = 4200;

/** Por cima do palco 3D: os níveis, a Coroa e as vidas, quando a dica fala deles. */
function SceneOverlay({ scene, tick }: { scene: Tip['scene']; tick: number }) {
  switch (scene) {
    case 'level': {
      const levels = DIFFICULTIES.map((d) => DIFFICULTY_LABELS_PT[d]);
      return (
        <View style={styles.levels}>
          {levels.map((l, i) => (
            <View key={l} style={[styles.levelTag, i <= tick % 4 && styles.levelOn]}>
              <GameText size="xs" color={i <= tick % 4 ? px.ink : '#C9D2F2'}>
                {tc(l)}
              </GameText>
            </View>
          ))}
        </View>
      );
    }
    case 'crown':
      return (
        <View style={styles.levels}>
          {[0, 1, 2].map((i) => (
            <StarIcon key={i} size={30} dim={i > tick % 3} />
          ))}
        </View>
      );
    case 'lives':
      return (
        <View style={styles.levels}>
          <Hearts value={tick % 2 ? 4 : 5} max={5} size={26} />
        </View>
      );
    default:
      return null;
  }
}

export function PrepOverlay({
  mode,
  status,
  look,
  onBack,
}: {
  mode: Mode;
  status: PrepStatus | null;
  look?: GolemLook | undefined;
  onBack?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), reducedMotion ? TIP_MS * 2 : 900);
    return () => clearInterval(timer);
  }, [reducedMotion]);
  const tips = TIPS[mode];
  const tipIndex = Math.floor((tick * (reducedMotion ? TIP_MS * 2 : 900)) / TIP_MS) % tips.length;
  const tip = tips[tipIndex]!;
  const unavailable = status?.status === 'unavailable';
  const total = Math.max(1, status?.total ?? 1);
  const done = Math.min(total, status?.done ?? 0);
  const language = LOCALE_INFO[currentLocale()].nativeName;

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.backdrop} testID="prep-overlay">
      <View style={styles.center}>
        <GamePanel style={styles.panel}>
          <GameText size="lg" align="center" shadow accessibilityRole="header">
            {unavailable ? t('Ainda não disponível em {language}', { language }) : mode === 'journey' ? t('Preparando a fase') : t('Preparando as perguntas')}
          </GameText>
          {unavailable ? (
            <>
              <T color="#DDE3FA" align="center">
                {t('Os textos desta fase ainda não existem neste idioma e a tradução automática está desligada no servidor. Escolha outro idioma no seu perfil ou tente mais tarde.')}
              </T>
              {onBack ? <GameButton label={t('Voltar')} tone="gold" onPress={onBack} /> : null}
            </>
          ) : (
            <>
              <View style={styles.stage}>
                <TutorialStage scene={tip.scene} look={look} style={StyleSheet.absoluteFill} still={reducedMotion} />
                <SceneOverlay scene={tip.scene} tick={tick} />
              </View>
              <Animated.View key={tipIndex} entering={reducedMotion ? undefined : FadeIn.duration(300)}>
                <T color={px.white} align="center" style={styles.tip}>
                  {t(tip.text)}
                </T>
              </Animated.View>
              <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: done }}>
                <View style={[styles.barFill, { width: `${Math.max(4, (done / total) * 100)}%` }]} />
              </View>
              <T variant="caption" color="#9FAAD6" align="center">
                {t('Traduzindo os textos do original para {language}. Isso só acontece na primeira vez: depois, a fase abre na hora para todo mundo.', { language })}
              </T>
              {onBack ? <GameButton label={t('Voltar')} tone="blue" size="sm" onPress={onBack} /> : null}
            </>
          )}
        </GamePanel>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,10,30,0.92)', zIndex: 50 },
  center: { flex: 1, justifyContent: 'center', padding: 16 },
  panel: { gap: 14, padding: 16 },
  stage: { height: 170, borderRadius: 22, overflow: 'hidden', justifyContent: 'flex-end' },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', padding: 8 },
  levelTag: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(19,28,85,0.8)' },
  levelOn: { backgroundColor: px.gold },
  tip: { minHeight: 66 },
  bar: { height: 12, borderRadius: 6, backgroundColor: '#2A3470', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6, backgroundColor: px.green },
});

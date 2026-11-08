/**
 * Peças de interface do Golem World: painel de veludo com fio dourado, botão
 * redondo que afunda ao toque e as contagens (corações, moedas, estrelas).
 */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type AccessibilityProps, type StyleProp, type ViewStyle } from 'react-native';
import { Chunky } from '@/components/ui/Chunky';
import { t, tn } from '@/lib/i18n';
import type { SoundName } from '@/lib/sound';
import { g } from '@/theme/game';
import { GameText } from './GameText';
import { CoinIcon, HeartIcon, StarIcon } from './icons';

export type PanelTone = 'velvet' | 'paper' | 'glass';

const PANELS: Record<PanelTone, { face: string; line: string; top: string }> = {
  velvet: { face: g.velvet, line: g.velvetLine, top: 'rgba(255,255,255,0.14)' },
  paper: { face: g.paper, line: g.paperDeep, top: 'rgba(255,255,255,0.7)' },
  glass: { face: 'rgba(18,24,61,0.86)', line: 'rgba(255,255,255,0.14)', top: 'rgba(255,255,255,0.22)' },
};

/** Painel: tom de tekhelet com fio fino e um fio mais claro no alto (sem sombra). */
export function GamePanel({ children, tone = 'velvet', style, testID }: { children: ReactNode; tone?: PanelTone; style?: StyleProp<ViewStyle>; testID?: string }) {
  const p = PANELS[tone];
  return (
    <View style={[styles.panel, { backgroundColor: p.face, borderColor: p.line, borderTopColor: p.top }, style]} testID={testID}>
      {children}
    </View>
  );
}

export type ButtonTone = 'gold' | 'green' | 'red' | 'blue' | 'paper' | 'grey' | 'ghost';

const TONES: Record<ButtonTone, { face: string; lip: string; text: string }> = {
  gold: { face: g.gold, lip: g.goldDeep, text: '#261A05' },
  green: { face: g.green, lip: g.greenDeep, text: '#0B2A1E' },
  red: { face: g.red, lip: g.redDeep, text: '#FFFFFF' },
  blue: { face: g.blue, lip: g.blueDeep, text: '#0E1236' },
  paper: { face: g.paper, lip: g.paperDeep, text: g.ink },
  grey: { face: '#3A4378', lip: '#262D5A', text: '#C3C9EA' },
  ghost: { face: 'rgba(255,255,255,0.08)', lip: 'rgba(0,0,0,0.22)', text: g.white },
};

export interface GameButtonProps extends AccessibilityProps {
  label: string;
  onPress?: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  loading?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** Desenho próprio antes do texto (moeda, item). */
  leading?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  sound?: SoundName;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: ReactNode;
}

export function GameButton({ label, onPress, tone = 'gold', disabled, loading, icon, leading, size = 'md', sound = 'pop', style, testID, children, ...a11y }: GameButtonProps) {
  const c = disabled ? TONES.grey : TONES[tone];
  const padV = size === 'lg' ? 16 : size === 'sm' ? 9 : 13;
  return (
    <Chunky
      accessibilityRole="button"
      accessibilityLabel={label}
      {...a11y}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      face={c.face}
      lip={c.lip}
      radius={size === 'sm' ? 12 : 16}
      lipHeight={size === 'sm' ? 2 : 3}
      sheen={tone !== 'ghost'}
      sound={sound}
      style={style}
      faceStyle={[styles.button, { paddingVertical: padV, paddingHorizontal: padV + 8 }]}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={c.text} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={c.text} /> : null}
          {leading}
          <GameText size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'} color={c.text} weight="semibold">
            {label}
          </GameText>
          {children}
        </>
      )}
    </Chunky>
  );
}

export function Hearts({ value, max, size = 22, testID }: { value: number; max: number; size?: number; testID?: string }) {
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={t('{n} de {max} corações', { n: value, max })} testID={testID}>
      {Array.from({ length: max }, (_, i) => (
        <HeartIcon key={i} size={size} dim={i >= value} />
      ))}
    </View>
  );
}

export function Coins({ value, color = g.white, size = 22 }: { value: number; color?: string; size?: number }) {
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={tn(value, '{n} moeda', '{n} moedas')}>
      <CoinIcon size={size} />
      <GameText size="md" weight="bold" color={color} shadow={color === g.white}>
        {value}
      </GameText>
    </View>
  );
}

export function Stars({ value, max = 3, size = 24 }: { value: number; max?: number; size?: number }) {
  return (
    <View style={styles.row} accessibilityRole="text" accessibilityLabel={t('{n} de {max} estrelas', { n: value, max })}>
      {Array.from({ length: max }, (_, i) => (
        <StarIcon key={i} size={size} dim={i >= value} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: 20, borderWidth: 1, padding: 16 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

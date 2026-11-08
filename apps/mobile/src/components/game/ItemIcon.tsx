/**
 * Ícones dos itens do armário em vetor (kipá, óculos, lamparina, shofar…), do material
 * do Golem (uma pedra de barro na cor) e dos personagens (o emblema de cada um).
 */
import { itemById } from '@trivia/shared';
import Svg, { Circle, Ellipse, G, Path, Polygon, Rect } from 'react-native-svg';

/** O barro de sempre (sem material comprado), igual ao do Golem 3D. */
const ORIGINAL_CLAY = '#A9714E';

/** Coroa pequena (Davi, Ester, Mordecai). */
function Crown({ y = 6, color = '#F2B630' }: { y?: number; color?: string }) {
  return <Path d={`M12 ${y + 8}l1.5-7 4 4 2.5-6 2.5 6 4-4 1.5 7Z`} fill={color} stroke="#B9780F" strokeWidth={0.8} />;
}

/** Emblema de cada personagem sobre um disco na cor da roupa. */
function CostumeEmblem({ id }: { id: string }) {
  switch (id) {
    case 'adao':
      return (
        <G>
          <Circle cx={20} cy={20} r={16} fill="#8A5A34" />
          <Path d="M12 27c4-12 12-15 17-15-1 9-6 15-17 15Z" fill="#6FAE4A" />
          <Path d="M13 26c4-5 8-8 13-11" stroke="#3F7A2C" strokeWidth={1.4} fill="none" />
        </G>
      );
    case 'eva':
      return (
        <G>
          <Circle cx={20} cy={20} r={16} fill="#A7754E" />
          {[0, 72, 144, 216, 288].map((a) => (
            <Circle key={a} cx={20 + 6 * Math.cos((a * Math.PI) / 180)} cy={20 + 6 * Math.sin((a * Math.PI) / 180)} r={4.4} fill="#F4A6C1" />
          ))}
          <Circle cx={20} cy={20} r={3.4} fill="#FFD04A" />
        </G>
      );
    case 'serpente':
      return (
        <G>
          <Circle cx={20} cy={20} r={16} fill="#2F6B3A" />
          <Path d="M27 11c-6-3-13 0-12 5s11 4 11 10-7 7-13 4" stroke="#7FD06B" strokeWidth={4.2} fill="none" strokeLinecap="round" />
          <Circle cx={27.5} cy={10.5} r={1.1} fill="#1B1E3D" />
        </G>
      );
    case 'noe':
      return (
        <G>
          <Circle cx={20} cy={20} r={16} fill="#5B83C4" />
          <Ellipse cx={19} cy={21} rx={8} ry={5} fill="#FFFFFF" />
          <Path d="M13 19l-5-5 9 3Z" fill="#F1F3F8" />
          <Circle cx={26} cy={18} r={3.2} fill="#FFFFFF" />
          <Path d="M29 18l4 1-4 1Z" fill="#F2B630" />
          <Path d="M30 21c3 2 4 5 3 7" stroke="#5E9B45" strokeWidth={1.6} fill="none" />
        </G>
      );
    case 'abraao':
      return (
        <G>
          <Circle cx={20} cy={20} r={16} fill="#B9874E" />
          <Path d="M18 33V13a4 4 0 1 1 7 2" stroke="#5E3B22" strokeWidth={2.6} fill="none" strokeLinecap="round" />
          <Path d="M8 30h24" stroke="#E7D3A5" strokeWidth={2} strokeDasharray="3 3" />
        </G>
      );
    case 'jose':
      return (
        <G>
          <Circle cx={20} cy={20} r={16} fill="#F5E8C8" />
          {['#D64545', '#F2B630', '#4C8DF0', '#5CC46A', '#9B5BE0'].map((c, i) => (
            <Rect key={c} x={10} y={9 + i * 4.6} width={20} height={4.6} fill={c} />
          ))}
        </G>
      );
    case 'moises':
      return (
        <G>
          <Circle cx={20} cy={20} r={16} fill="#7A5236" />
          <Path d="M17 34 23 8" stroke="#E2C28F" strokeWidth={2.8} strokeLinecap="round" />
          <Path d="M23 8c3-1 5 1 4 3" stroke="#E2C28F" strokeWidth={2.4} fill="none" strokeLinecap="round" />
        </G>
      );
    case 'miriam':
      return (
        <G>
          <Circle cx={20} cy={20} r={16} fill="#B0447A" />
          <Circle cx={20} cy={20} r={9} fill="#F3DCA8" stroke="#8C5A2B" strokeWidth={2.4} />
          {[0, 90, 180, 270].map((a) => (
            <Circle key={a} cx={20 + 9 * Math.cos((a * Math.PI) / 180)} cy={20 + 9 * Math.sin((a * Math.PI) / 180)} r={1.8} fill="#F2B630" />
          ))}
        </G>
      );
    case 'aarao':
      return (
        <G>
          <Circle cx={20} cy={20} r={16} fill="#2A3C9C" />
          <Rect x={12} y={10} width={16} height={20} rx={2} fill="#F2B630" />
          {['#D64545', '#5CC46A', '#4C8DF0', '#F4F4F4', '#9B5BE0', '#FF9A3C', '#1FA59A', '#E85D9C', '#8BD3F7', '#7A4B2A', '#FFD04A', '#2F6B3A'].map((c, i) => (
            <Rect key={c} x={13.5 + (i % 3) * 4.6} y={11.5 + Math.floor(i / 3) * 4.6} width={3.6} height={3.6} rx={0.8} fill={c} />
          ))}
        </G>
      );
    case 'davi':
      return (
        <G>
          <Circle cx={20} cy={20} r={16} fill="#6D3B9E" />
          <Path d="M13 32 15 14c4 0 9 2 12 6l-1 12Z" fill="none" stroke="#F2B630" strokeWidth={2.4} strokeLinejoin="round" />
          {[0, 1, 2, 3].map((i) => (
            <Path key={i} d={`M${16 + i * 2.5} ${15 + i} V31`} stroke="#FFF3C4" strokeWidth={0.9} />
          ))}
          <Crown y={2} />
        </G>
      );
    case 'ester':
      return (
        <G>
          <Circle cx={20} cy={20} r={16} fill="#8E3AA6" />
          <Crown y={12} />
          <Circle cx={20} cy={16} r={1.6} fill="#D64545" />
          <Path d="M11 29c3 2 15 2 18 0" stroke="#F2B630" strokeWidth={1.6} fill="none" />
        </G>
      );
    case 'mordecai':
      return (
        <G>
          <Circle cx={20} cy={20} r={16} fill="#F4F6FB" />
          <Path d="M8 20h24v5H8Z" fill="#2D5DB8" />
          <Path d="M8 28h24v3H8Z" fill="#2D5DB8" />
          <Crown y={6} />
        </G>
      );
    case 'jonas':
      return (
        <G>
          <Circle cx={20} cy={20} r={16} fill="#2E7FB8" />
          <Ellipse cx={18} cy={21} rx={10} ry={6.5} fill="#7FC6E8" />
          <Polygon points="27,21 34,15 34,27" fill="#7FC6E8" />
          <Circle cx={13} cy={19.5} r={1.4} fill="#1B1E3D" />
          <Path d="M10 9c2 2 2 4 0 6M15 8c2 2 2 4 0 6" stroke="#FFFFFF" strokeWidth={1.2} fill="none" />
        </G>
      );
    default:
      return <Circle cx={20} cy={20} r={14} fill="#A9AEBF" />;
  }
}

/** Material do Golem: uma pedra de barro facetada, na cor. */
function ClaySwatch({ color }: { color: string }) {
  return (
    <G>
      <Polygon points="20,5 33,12 35,26 24,35 9,32 5,18" fill={color} />
      <Polygon points="20,5 33,12 22,18 5,18" fill="#FFFFFF" opacity={0.22} />
      <Polygon points="22,18 35,26 24,35" fill="#000000" opacity={0.18} />
    </G>
  );
}

export function ItemIcon({ id, size = 40 }: { id: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden importantForAccessibility="no">
      {(() => {
        switch (id) {
          case 'kipa-azul':
          case 'kipa-vermelha':
          case 'kipa-shabat': {
            const color = id === 'kipa-azul' ? '#1D2A78' : id === 'kipa-vermelha' ? '#D64545' : '#FFFFFF';
            return (
              <G>
                <Path d="M6 26c0-9 6.3-15 14-15s14 6 14 15Z" fill={color} stroke={id === 'kipa-shabat' ? '#D9C9A8' : 'none'} strokeWidth={1.2} />
                <Path d="M10 22c2-5 6-7.5 10-7.5" stroke="rgba(255,255,255,0.35)" strokeWidth={2} fill="none" strokeLinecap="round" />
                {id !== 'kipa-vermelha' ? <Rect x={6} y={25} width={28} height={2.6} rx={1.3} fill="#F2B630" /> : null}
              </G>
            );
          }
          case 'oculos':
            return (
              <G stroke="#3B2A20" strokeWidth={2.4} fill="rgba(200,230,255,0.5)">
                <Circle cx={12} cy={21} r={6.5} />
                <Circle cx={28} cy={21} r={6.5} />
                <Path d="M18.5 20h3M5.5 19 3 16M34.5 19 37 16" fill="none" strokeLinecap="round" />
              </G>
            );
          case 'lupa':
            return (
              <G>
                <Rect x={22} y={24} width={5} height={13} rx={2.5} fill="#7E532D" transform="rotate(-40 24.5 30.5)" />
                <Circle cx={17} cy={17} r={10} fill="rgba(190,225,255,0.55)" stroke="#F2B630" strokeWidth={3.4} />
                <Path d="M12 13a6 6 0 0 1 5-3" stroke="#FFFFFF" strokeWidth={2} fill="none" strokeLinecap="round" />
              </G>
            );
          case 'lamparina':
            return (
              <G>
                <Path d="M5 26c3 5 17 6 24 2l5-5h-6c-6 0-17-1-23 3Z" fill="#C58D66" />
                <Path d="M31 20c-2-4 1-9 3-11 1 3 3 7 0 11Z" fill="#FFB02E" />
                <Path d="M32 19c-1-2 0-4 1.5-6 .6 2 1.2 4-.5 6Z" fill="#FFE07A" />
              </G>
            );
          case 'sacola':
            return (
              <G>
                <Rect x={8} y={12} width={24} height={22} rx={5} fill="#6B4A9A" />
                <Path d="M14 12V9a6 6 0 0 1 12 0v3" stroke="#4E3473" strokeWidth={3} fill="none" />
                <Rect x={11} y={20} width={18} height={7} rx={3} fill="#8C69BD" />
                <Rect x={13} y={6} width={5} height={9} rx={1} fill="#D64545" />
                <Rect x={20} y={7} width={5} height={8} rx={1} fill="#3E7BD6" />
              </G>
            );
          case 'tzitzit':
            return (
              <G>
                <Path d="M9 8h22l2 20H7Z" fill="#FFFFFF" stroke="#D9D2C2" strokeWidth={1} />
                <Rect x={7.5} y={18} width={25} height={3} fill="#3E7BD6" />
                <Path d="M14 8c0 3 2 5 6 5s6-2 6-5" fill="#EDE6D6" />
                <G stroke="#3E7BD6" strokeWidth={1.4}>
                  <Path d="M9 28v8M11 28v7M29 28v8M31 28v7" />
                </G>
              </G>
            );
          case 'pena':
            return (
              <G>
                <Path d="M30 4C18 8 11 18 9 30c6-2 12-6 16-12 3-4 4-9 5-14Z" fill="#F6EBD3" stroke="#D8C7A2" strokeWidth={1} />
                <Path d="M28 7 8 34" stroke="#8C7B62" strokeWidth={1.6} strokeLinecap="round" />
              </G>
            );
          case 'shofar':
            return (
              <G>
                <Path d="M6 30c8 1 16-3 21-9 3-4 5-9 7-14-4 1-7 5-9 9-3 5-9 9-17 10Z" fill="#D9B98A" />
                <Path d="M34 7c-2 1-4 3-5 5" stroke="#B28E5C" strokeWidth={2.6} strokeLinecap="round" />
                <Circle cx={6.5} cy={28} r={2.4} fill="#B28E5C" />
              </G>
            );
          case 'bandeira':
            return (
              <G>
                <Rect x={8} y={4} width={3} height={32} rx={1.5} fill="#7E532D" />
                <Rect x={11} y={6} width={22} height={15} fill="#FFFFFF" stroke="#D9D2C2" strokeWidth={1} />
                <Rect x={11} y={7.5} width={22} height={2} fill="#3E7BD6" />
                <Rect x={11} y={17.5} width={22} height={2} fill="#3E7BD6" />
                <Rect x={18} y={11} width={2.4} height={5} rx={1} fill="#C98A12" />
                <Rect x={23.6} y={11} width={2.4} height={5} rx={1} fill="#C98A12" />
              </G>
            );
          case 'chavruta':
            return (
              <G>
                <Rect x={9} y={8} width={22} height={19} rx={6} fill="#C58D66" />
                <Circle cx={16} cy={17} r={2.4} fill="#2A1C14" />
                <Circle cx={24} cy={17} r={2.4} fill="#2A1C14" />
                <Path d="M17 22c1.6 1.6 4.4 1.6 6 0" stroke="#2A1C14" strokeWidth={1.6} fill="none" strokeLinecap="round" />
                <Rect x={12} y={27} width={16} height={9} rx={2} fill="#1D2A78" />
                <Rect x={19.4} y={27} width={1.2} height={9} fill="#F2B630" />
              </G>
            );
          default: {
            if (id === 'barro-original') return <ClaySwatch color={ORIGINAL_CLAY} />;
            const def = itemById(id);
            if (def?.slot === 'skin' && def.clay) return <ClaySwatch color={def.clay} />;
            if (def?.slot === 'costume') return <CostumeEmblem id={id} />;
            return <Circle cx={20} cy={20} r={12} fill="#A9AEBF" />;
          }
        }
      })()}
    </Svg>
  );
}

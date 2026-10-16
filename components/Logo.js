import React from "react";
import Svg, { G, Mask, Rect, Circle, Path, Line, Defs } from "react-native-svg";

// The ticket "C" of the app (assets/brand/logo.svg), cropped to the ticket. Brand colours: the same on every palette.
export default function Logo({ width = 46 }) {
  const height = Math.round((width * 620) / 850);
  return (
    <Svg width={width} height={height} viewBox="90 200 850 620" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <Mask id="logoTicket">
          <Rect x={162} y={292} width={700} height={440} rx={64} fill="#fff" />
          <Circle cx={666} cy={292} r={38} fill="#000" />
          <Circle cx={666} cy={732} r={38} fill="#000" />
        </Mask>
      </Defs>
      <G transform="rotate(-11 512 512)">
        <Rect x={162} y={292} width={700} height={440} rx={64} fill="#F4B740" mask="url(#logoTicket)" />
        <Path d="M 500.26 439.73 A 108 108 0 1 0 500.26 584.27" fill="none" stroke="#17120E" strokeWidth={68} />
        <Line x1={666} y1={358} x2={666} y2={666} stroke="#17120E" strokeWidth={11} strokeDasharray="22 20" strokeLinecap="round" />
        <Circle cx={528} cy={512} r={31} fill="#3FD6C0" />
      </G>
    </Svg>
  );
}

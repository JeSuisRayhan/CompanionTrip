import React, { createContext, useContext, useRef } from "react";
import { ScrollView, View } from "react-native";

// The trip screen puts its title block and its tabs at the top of whichever tab
// is open, so that the title scrolls away and leaves the room to the content.
// TripScreen provides the block (`top`) through this context and listens to the
// scroll (`onScroll`) to pin the tabs once the title is gone.
export const TripChromeContext = createContext(null);

// The scrolling body of one tab. Outside the trip screen (a park day opens the
// same tabs on their own) it is a plain ScrollView.
export default function TripScroll({ contentContainerStyle, children, ...rest }) {
  const chrome = useContext(TripChromeContext);
  const ref = useRef(null);
  const placed = useRef(false);

  if (!chrome) {
    return (
      <ScrollView contentContainerStyle={contentContainerStyle} {...rest}>
        {children}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={ref}
      {...rest}
      scrollEventThrottle={16}
      onScroll={(e) => chrome.onScroll(e.nativeEvent.contentOffset.y)}
      // Switching tabs while the title is scrolled away keeps the tabs where they were.
      onContentSizeChange={() => {
        if (placed.current) return;
        placed.current = true;
        const y = chrome.takeRestore();
        if (y > 0 && ref.current) ref.current.scrollTo({ y, animated: false });
      }}
    >
      {chrome.top}
      <View style={contentContainerStyle}>{children}</View>
    </ScrollView>
  );
}

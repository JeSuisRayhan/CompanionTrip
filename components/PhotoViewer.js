// The full-screen viewer of a series of pictures (the souvenir photos, the photos of the documents): a touch on one
// opens it, and the next or the previous one is a swipe away, like in the phone's gallery.
// Plain React Native only (a paged horizontal list): no module to add, so it goes out as an update.
//
//   <PhotoViewer viewer={{ items, index }} onClose={...} renderTitle={(item) => "…"} renderFooter={(item) => <…/>} />
//
// `viewer` is null while the viewer is closed. `items` are { id, uri, label or title, … }; `index` is the one to start on.
// The list is paged: the picture that is next sits on the right, so the finger goes left to bring it in.
import React, { useCallback, useRef, useState } from "react";
import { Modal, FlatList, Image, Pressable, Text, View, StyleSheet, useWindowDimensions } from "react-native";
import Icon from "./Icon";
import { FONTS } from "../lib/theme";

const WHITE = "#FFFFFF";
const SOFT = "rgba(255, 255, 255, 0.74)";
const CHIP = "rgba(255, 255, 255, 0.16)";

function Pager({ items, startIndex, onClose, renderTitle, renderFooter }) {
  const win = useWindowDimensions();
  // The room the viewer really has (measured), the window's size until then: one page = that room.
  const [box, setBox] = useState({ width: win.width, height: win.height });
  const { width, height } = box;
  const first = Math.min(Math.max(0, startIndex || 0), items.length - 1);
  const [index, setIndex] = useState(first);
  const at = useRef(first); // the same index, for what is not drawn again with it
  at.current = Math.min(index, items.length - 1);
  const listRef = useRef(null);
  const current = items[at.current] || items[first];
  const title = renderTitle ? renderTitle(current) : null;
  const many = items.length > 1;

  // The index follows the finger: the title and the counter change as soon as the next picture is half in.
  const move = useCallback(
    (e) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      setIndex((now) => (next >= 0 && next < items.length && next !== now ? next : now));
    },
    [width, items.length]
  );
  // Until the list has placed itself on the picture it opens on, what it says of its position means nothing: wait
  // for it to get there (or for a finger). The end of a swipe always settles the index, whoever made the swipe.
  const ready = useRef(first === 0);
  const onScroll = useCallback(
    (e) => {
      if (ready.current) return move(e);
      if (Math.round(e.nativeEvent.contentOffset.x / width) === first) ready.current = true;
    },
    [move, width, first]
  );
  const onScrollBeginDrag = useCallback(() => {
    ready.current = true;
  }, []);
  // The room is known (or changed, a tablet turned): measure it, and stay on the same picture.
  const onLayout = useCallback((e) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (!w || !h) return;
    setBox((b) => (Math.abs(b.width - w) < 0.5 && Math.abs(b.height - h) < 0.5 ? b : { width: w, height: h }));
    if (at.current > 0 && listRef.current) listRef.current.scrollToOffset({ offset: at.current * w, animated: false });
  }, []);

  const renderItem = useCallback(
    ({ item, index: i }) => (
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={`${item.label || item.title || "Photo"}${items.length > 1 ? `, ${i + 1} sur ${items.length}` : ""}. Toucher pour fermer.`}
        style={[styles.page, { width, height }]}
      >
        <Image source={{ uri: item.uri }} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
      </Pressable>
    ),
    [width, height, items.length, onClose]
  );

  return (
    <View style={styles.root} onLayout={onLayout}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        scrollEnabled={many}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        initialScrollIndex={first}
        initialNumToRender={1}
        windowSize={3}
        maxToRenderPerBatch={1}
        scrollEventThrottle={16}
        onScrollBeginDrag={onScrollBeginDrag}
        onScroll={onScroll}
        onMomentumScrollEnd={move}
        onScrollToIndexFailed={() => {}}
      />
      <View style={styles.top} pointerEvents="box-none">
        <View style={styles.heading} pointerEvents="none">
          {title ? <Text style={styles.title} numberOfLines={2}>{title}</Text> : null}
          {many ? (
            <Text style={styles.count} accessibilityLiveRegion="polite">{`${Math.min(index, items.length - 1) + 1} / ${items.length}`}</Text>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} hitSlop={6} style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}>
          <Icon name="close" size={24} color={WHITE} />
        </Pressable>
      </View>
      {renderFooter ? (
        <View style={styles.bottom} pointerEvents="box-none">
          {renderFooter(current)}
        </View>
      ) : null}
    </View>
  );
}

export default function PhotoViewer({ viewer, onClose, renderTitle, renderFooter }) {
  const open = !!viewer && viewer.items.length > 0;
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {open ? <Pager items={viewer.items} startIndex={viewer.index} onClose={onClose} renderTitle={renderTitle} renderFooter={renderFooter} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000EE" },
  page: { alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "80%" },
  top: { position: "absolute", top: 50, left: 0, right: 0, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 20, gap: 12 },
  heading: { flex: 1, minHeight: 44, justifyContent: "center", gap: 2 },
  title: { fontFamily: FONTS.bodySemi, fontSize: 16, lineHeight: 22, color: WHITE },
  count: { fontFamily: FONTS.monoMed, fontSize: 14, lineHeight: 18, color: SOFT },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: CHIP },
  bottom: { position: "absolute", left: 16, right: 16, bottom: 24, flexDirection: "row", alignItems: "center", justifyContent: "flex-start" },
});

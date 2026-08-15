const STYLE_ID = 'sila-home-news-layout-fix'

function installHomeNewsLayoutFix() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
/* Home latest-news carousel: match the supplied reference structure.
   Narrow portrait cards, colored title strip, large reusable type artwork,
   compact copy and a single bottom action bar. */
main .section-block.soft {
  overflow: hidden !important;
}

/* Reference heading: آخر الأخبار / العائلة */
main .section-block.soft .section-title h2 {
  font-size: 0 !important;
}
main .section-block.soft .section-title h2::after {
  content: 'العائلة' !important;
  color: #293554 !important;
  font-size: clamp(1.18rem, 3.4vw, 1.55rem) !important;
  font-weight: 900 !important;
  line-height: 1.35 !important;
}

main .section-block.soft .cards-grid.event-grid,
main .section-block.soft .event-grid {
  display: flex !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  height: auto !important;
  min-height: 0 !important;
  flex-direction: row !important;
  align-items: stretch !important;
  gap: 10px !important;
  padding: 2px 2px 10px 14px !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  scroll-snap-type: x mandatory !important;
  scroll-padding-inline: 2px !important;
  scroll-behavior: smooth !important;
  overscroll-behavior-inline: contain !important;
  -webkit-overflow-scrolling: touch !important;
  scrollbar-width: none !important;
}

main .section-block.soft .cards-grid.event-grid::-webkit-scrollbar,
main .section-block.soft .event-grid::-webkit-scrollbar {
  display: none !important;
}

main .section-block.soft .cards-grid.event-grid > .event-card,
main .section-block.soft .event-grid > .event-card {
  position: relative !important;
  display: flex !important;
  box-sizing: border-box !important;
  width: 208px !important;
  max-width: 208px !important;
  min-width: 208px !important;
  min-height: 390px !important;
  height: auto !important;
  flex: 0 0 208px !important;
  flex-direction: column !important;
  align-self: stretch !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 0 42px !important;
  border: 1px solid #e9e2da !important;
  border-radius: 20px !important;
  color: #252c36 !important;
  background: #fff !important;
  box-shadow: 0 8px 22px rgb(49 48 61 / 6%) !important;
  scroll-snap-align: start !important;
  transform: none !important;
}

/* Colored card title strip, like the reference. */
main .section-block.soft .event-card .event-top {
  position: static !important;
  z-index: 3 !important;
  order: 1 !important;
  display: flex !important;
  width: 100% !important;
  min-height: 44px !important;
  box-sizing: border-box !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
  margin: 0 !important;
  padding: 8px 9px !important;
  border: 0 !important;
  background: #f1ede7 !important;
}

main .section-block.soft .event-card .event-top > span {
  display: block !important;
  min-height: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  color: #1f2530 !important;
  background: transparent !important;
  box-shadow: none !important;
  font-size: .72rem !important;
  font-weight: 900 !important;
  line-height: 1.35 !important;
  text-align: center !important;
  white-space: nowrap !important;
}

/* The reference strip does not show a separate date badge. */
main .section-block.soft .event-card .event-top > time {
  display: none !important;
}

/* Large reusable visual per type. This replaces unique photos while preserving the same card shape. */
main .section-block.soft .event-card::before {
  position: static !important;
  z-index: 1 !important;
  order: 2 !important;
  display: grid !important;
  width: 100% !important;
  height: 168px !important;
  min-height: 168px !important;
  box-sizing: border-box !important;
  place-items: center !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  color: #fff !important;
  background:
    radial-gradient(circle at 22% 18%, rgb(255 255 255 / 34%) 0 22px, transparent 23px),
    radial-gradient(circle at 84% 80%, rgb(255 255 255 / 17%) 0 38px, transparent 39px),
    linear-gradient(145deg, #c8b99f, #9f8663) !important;
  box-shadow: inset 0 -1px 0 rgb(0 0 0 / 5%) !important;
  font-family: "Apple Color Emoji", "Segoe UI Emoji", sans-serif !important;
  font-size: 74px !important;
  line-height: 1 !important;
  content: '📰' !important;
  text-shadow: 0 10px 24px rgb(30 39 57 / 18%) !important;
}

main .section-block.soft .event-card::after {
  display: none !important;
  content: none !important;
}

/* Per-type reusable artwork + matching title strip. */
main .section-block.soft .event-type-wedding .event-top { background: linear-gradient(135deg, #f0d8d9, #e7bec4) !important; }
main .section-block.soft .event-type-wedding::before {
  content: '💍' !important;
  background: radial-gradient(circle at 78% 22%, rgb(255 255 255 / 28%) 0 30px, transparent 31px), linear-gradient(145deg, #d999a4, #b76672) !important;
}

main .section-block.soft .event-type-birth .event-top { background: linear-gradient(135deg, #dff2ef, #c6e8e4) !important; }
main .section-block.soft .event-type-birth::before {
  content: '👶' !important;
  background: radial-gradient(circle at 18% 78%, rgb(255 255 255 / 26%) 0 30px, transparent 31px), linear-gradient(145deg, #8bcfc5, #5ba9ae) !important;
}

main .section-block.soft .event-type-naming .event-top { background: linear-gradient(135deg, #e7f1e6, #cfdfcc) !important; }
main .section-block.soft .event-type-naming::before {
  content: '🍼' !important;
  background: radial-gradient(circle at 82% 18%, rgb(255 255 255 / 26%) 0 28px, transparent 29px), linear-gradient(145deg, #9fc9a7, #699883) !important;
}

main .section-block.soft .event-type-graduation .event-top { background: linear-gradient(135deg, #dbb56f, #c89949) !important; }
main .section-block.soft .event-type-graduation::before {
  content: '🎓' !important;
  background: radial-gradient(circle at 18% 18%, rgb(223 182 100 / 25%) 0 32px, transparent 33px), linear-gradient(145deg, #435473, #202f4d) !important;
}

main .section-block.soft .event-type-death .event-top { background: linear-gradient(135deg, #e5e7ea, #ced3d9) !important; }
main .section-block.soft .event-type-death::before {
  content: '🕊️' !important;
  background: radial-gradient(circle at 80% 20%, rgb(255 255 255 / 12%) 0 32px, transparent 33px), linear-gradient(145deg, #75808b, #414b57) !important;
}

main .section-block.soft .event-type-general .event-top,
main .section-block.soft .event-type-other .event-top { background: linear-gradient(135deg, #efd7aa, #dfbd7e) !important; }
main .section-block.soft .event-type-general::before {
  content: '📰' !important;
  background: radial-gradient(circle at 20% 24%, rgb(255 255 255 / 23%) 0 28px, transparent 29px), linear-gradient(145deg, #d2a45b, #9b6d30) !important;
}
main .section-block.soft .event-type-other::before {
  content: '🎉' !important;
  background: radial-gradient(circle at 82% 22%, rgb(255 255 255 / 22%) 0 28px, transparent 29px), linear-gradient(145deg, #c9a262, #8e6e3a) !important;
}

/* Put the linked person before the title, like the reference cards. */
main .section-block.soft .event-card .event-mention-chips {
  order: 3 !important;
  display: flex !important;
  width: 100% !important;
  min-height: 27px !important;
  box-sizing: border-box !important;
  align-items: center !important;
  margin: 0 !important;
  padding: 9px 12px 0 !important;
  overflow: hidden !important;
}

main .section-block.soft .event-card .event-mention-chip {
  display: block !important;
  max-width: 100% !important;
  min-width: 0 !important;
  height: auto !important;
  overflow: hidden !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  color: #26334f !important;
  background: transparent !important;
  box-shadow: none !important;
  font-size: .66rem !important;
  font-weight: 900 !important;
  text-align: right !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
main .section-block.soft .event-card .event-mention-chip:not(:first-child) {
  display: none !important;
}

main .section-block.soft .event-card h3 {
  order: 4 !important;
  display: -webkit-box !important;
  overflow: hidden !important;
  margin: 7px 12px 0 !important;
  color: #222936 !important;
  font-size: .82rem !important;
  font-weight: 900 !important;
  line-height: 1.55 !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 2 !important;
  line-clamp: 2 !important;
}

main .section-block.soft .event-card > p {
  order: 5 !important;
  display: -webkit-box !important;
  overflow: hidden !important;
  margin: 7px 12px 0 !important;
  color: #666a70 !important;
  font-size: .65rem !important;
  line-height: 1.72 !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 3 !important;
  line-clamp: 3 !important;
}

main .section-block.soft .event-card > small {
  order: 6 !important;
  display: block !important;
  overflow: hidden !important;
  margin: 8px 12px 9px !important;
  color: #8b8985 !important;
  font-size: .57rem !important;
  line-height: 1.5 !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

/* Flatten share/edit into one compact bottom action bar. */
main .section-block.soft .event-card > .event-share-wrap {
  position: absolute !important;
  right: 0 !important;
  bottom: 0 !important;
  z-index: 5 !important;
  display: block !important;
  width: 50% !important;
  height: 40px !important;
  margin: 0 !important;
  padding: 0 !important;
  border-top: 1px solid #ece7e1 !important;
  background: #fff !important;
}

main .section-block.soft .event-card:not(:has(> .record-action-group)) > .event-share-wrap {
  width: 100% !important;
}

main .section-block.soft .event-card > .event-share-wrap .event-share-button {
  display: flex !important;
  width: 100% !important;
  height: 40px !important;
  min-height: 40px !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 5px !important;
  margin: 0 !important;
  padding: 0 5px !important;
  border: 0 !important;
  border-radius: 0 !important;
  color: #293554 !important;
  background: transparent !important;
  box-shadow: none !important;
}
main .section-block.soft .event-card > .event-share-wrap .event-share-button > span {
  font-size: .82rem !important;
}
main .section-block.soft .event-card > .event-share-wrap .event-share-button > b {
  font-size: .6rem !important;
  font-weight: 850 !important;
  white-space: nowrap !important;
}
main .section-block.soft .event-card > .event-share-wrap .event-share-button > small {
  display: none !important;
}

main .section-block.soft .event-card > .record-action-group {
  position: absolute !important;
  bottom: 0 !important;
  left: 0 !important;
  z-index: 5 !important;
  display: flex !important;
  width: 50% !important;
  height: 40px !important;
  align-items: stretch !important;
  margin: 0 !important;
  padding: 0 !important;
  border-top: 1px solid #ece7e1 !important;
  border-right: 1px solid #ece7e1 !important;
  background: #fff !important;
}
main .section-block.soft .event-card > .record-action-group .record-edit-trigger {
  width: 100% !important;
  height: 40px !important;
  min-height: 40px !important;
  margin: 0 !important;
  padding: 0 4px !important;
  border: 0 !important;
  border-radius: 0 !important;
  color: #293554 !important;
  background: transparent !important;
  box-shadow: none !important;
  font-size: .6rem !important;
  font-weight: 850 !important;
}

@media (max-width: 760px) {
  main .section-block.soft {
    padding-inline: 14px !important;
  }

  main .section-block.soft .cards-grid.event-grid,
  main .section-block.soft .event-grid {
    width: calc(100% + 14px) !important;
    max-width: calc(100% + 14px) !important;
    margin-inline-end: -14px !important;
    gap: 10px !important;
    padding-inline-end: 14px !important;
  }

  /* Wider cards: roughly 1.5–2 cards remain visible on a phone. */
  main .section-block.soft .cards-grid.event-grid > .event-card,
  main .section-block.soft .event-grid > .event-card {
    width: clamp(170px, 47vw, 220px) !important;
    max-width: clamp(170px, 47vw, 220px) !important;
    min-width: clamp(170px, 47vw, 220px) !important;
    min-height: 350px !important;
    flex-basis: clamp(170px, 47vw, 220px) !important;
    border-radius: 18px !important;
    padding-bottom: 38px !important;
  }

  main .section-block.soft .event-card .event-top {
    min-height: 40px !important;
    padding: 7px 7px !important;
  }
  main .section-block.soft .event-card .event-top > span {
    max-width: 100% !important;
    overflow: hidden !important;
    font-size: .64rem !important;
    text-overflow: ellipsis !important;
  }

  main .section-block.soft .event-card::before {
    height: 146px !important;
    min-height: 146px !important;
    font-size: 64px !important;
  }

  main .section-block.soft .event-card .event-mention-chips {
    min-height: 24px !important;
    padding: 8px 10px 0 !important;
  }
  main .section-block.soft .event-card .event-mention-chip {
    font-size: .58rem !important;
  }

  main .section-block.soft .event-card h3 {
    margin: 6px 10px 0 !important;
    font-size: .74rem !important;
    line-height: 1.52 !important;
  }
  main .section-block.soft .event-card > p {
    margin: 6px 10px 0 !important;
    font-size: .6rem !important;
    line-height: 1.66 !important;
    -webkit-line-clamp: 3 !important;
    line-clamp: 3 !important;
  }
  main .section-block.soft .event-card > small {
    margin: 7px 10px 8px !important;
    font-size: .52rem !important;
  }

  main .section-block.soft .event-card > .event-share-wrap,
  main .section-block.soft .event-card > .record-action-group {
    height: 37px !important;
  }
  main .section-block.soft .event-card > .event-share-wrap .event-share-button,
  main .section-block.soft .event-card > .record-action-group .record-edit-trigger {
    height: 37px !important;
    min-height: 37px !important;
  }
  main .section-block.soft .event-card > .event-share-wrap .event-share-button > span {
    font-size: .7rem !important;
  }
  main .section-block.soft .event-card > .event-share-wrap .event-share-button > b,
  main .section-block.soft .event-card > .record-action-group .record-edit-trigger {
    font-size: .53rem !important;
  }
}
`

  document.head.appendChild(style)
}

installHomeNewsLayoutFix()

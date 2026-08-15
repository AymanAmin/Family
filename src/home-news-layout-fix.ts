const STYLE_ID = 'sila-home-news-layout-fix'

function installHomeNewsLayoutFix() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
/* Home latest-news carousel inspired by the supplied family-app reference.
   Each event type gets one reusable large visual/icon instead of a unique image. */
main .section-block.soft .cards-grid.event-grid,
main .section-block.soft .event-grid {
  display: flex !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  height: auto !important;
  min-height: 0 !important;
  flex-direction: row !important;
  align-items: flex-start !important;
  gap: 14px !important;
  padding: 2px 2px 10px 18px !important;
  overflow-x: auto !important;
  overflow-y: visible !important;
  scroll-snap-type: x proximity !important;
  scroll-padding-inline: 2px !important;
  scroll-behavior: smooth !important;
  overscroll-behavior-inline: contain !important;
  -webkit-overflow-scrolling: touch !important;
  scrollbar-width: none !important;
  transform: none !important;
}

main .section-block.soft .cards-grid.event-grid::-webkit-scrollbar,
main .section-block.soft .event-grid::-webkit-scrollbar {
  display: none !important;
}

main .section-block.soft .cards-grid.event-grid > .event-card,
main .section-block.soft .event-grid > .event-card {
  position: relative !important;
  display: block !important;
  box-sizing: border-box !important;
  width: 286px !important;
  max-width: 286px !important;
  min-width: 286px !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  flex: 0 0 286px !important;
  align-self: flex-start !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 0 14px !important;
  border: 1px solid #e9e1d8 !important;
  border-radius: 22px !important;
  background: #fff !important;
  box-shadow: 0 10px 26px rgb(49 48 61 / 7%) !important;
  scroll-snap-align: start !important;
  transform: none !important;
}

/* Reusable visual area. */
main .section-block.soft .event-card::before {
  display: block !important;
  width: 100% !important;
  height: 156px !important;
  margin: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background:
    radial-gradient(circle at 20% 24%, rgb(255 255 255 / 30%) 0 20px, transparent 21px),
    radial-gradient(circle at 78% 78%, rgb(255 255 255 / 18%) 0 38px, transparent 39px),
    linear-gradient(145deg, #eef1f6, #dde3ec) !important;
  content: '' !important;
}

main .section-block.soft .event-card::after {
  position: absolute !important;
  top: 42px !important;
  left: 50% !important;
  z-index: 2 !important;
  display: grid !important;
  width: 82px !important;
  height: 82px !important;
  place-items: center !important;
  border: 5px solid rgb(255 255 255 / 72%) !important;
  border-radius: 50% !important;
  color: #fff !important;
  background: rgb(255 255 255 / 20%) !important;
  box-shadow: 0 12px 28px rgb(32 42 67 / 14%) !important;
  font-family: "Apple Color Emoji", "Segoe UI Emoji", sans-serif !important;
  font-size: 43px !important;
  line-height: 1 !important;
  transform: translateX(-50%) !important;
  content: '📰' !important;
  pointer-events: none !important;
}

/* One generic artwork/icon per news type. */
main .section-block.soft .event-type-wedding::before {
  background: radial-gradient(circle at 18% 18%, rgb(255 255 255 / 34%) 0 24px, transparent 25px), linear-gradient(145deg, #d9a27e, #b86670) !important;
}
main .section-block.soft .event-type-wedding::after { content: '💍' !important; }

main .section-block.soft .event-type-birth::before {
  background: radial-gradient(circle at 82% 22%, rgb(255 255 255 / 38%) 0 24px, transparent 25px), linear-gradient(145deg, #91d3c9, #5aa9ad) !important;
}
main .section-block.soft .event-type-birth::after { content: '👶' !important; }

main .section-block.soft .event-type-naming::before {
  background: radial-gradient(circle at 18% 78%, rgb(255 255 255 / 30%) 0 30px, transparent 31px), linear-gradient(145deg, #a8d0b1, #6fa38a) !important;
}
main .section-block.soft .event-type-naming::after { content: '🍼' !important; }

main .section-block.soft .event-type-graduation::before {
  background: radial-gradient(circle at 80% 20%, rgb(245 199 117 / 38%) 0 28px, transparent 29px), linear-gradient(145deg, #344668, #1f2e4c) !important;
}
main .section-block.soft .event-type-graduation::after { content: '🎓' !important; }

main .section-block.soft .event-type-death::before {
  background: radial-gradient(circle at 22% 24%, rgb(255 255 255 / 12%) 0 32px, transparent 33px), linear-gradient(145deg, #6f7a86, #3e4856) !important;
}
main .section-block.soft .event-type-death::after { content: '🕊️' !important; }

main .section-block.soft .event-type-general::before,
main .section-block.soft .event-type-other::before {
  background: radial-gradient(circle at 78% 24%, rgb(255 255 255 / 24%) 0 26px, transparent 27px), linear-gradient(145deg, #d3a65f, #9c6c2d) !important;
}
main .section-block.soft .event-type-general::after { content: '📰' !important; }
main .section-block.soft .event-type-other::after { content: '✨' !important; }

/* Type/date badges sit over the artwork. */
main .section-block.soft .event-card .event-top {
  position: absolute !important;
  top: 12px !important;
  right: 12px !important;
  left: 12px !important;
  z-index: 3 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  margin: 0 !important;
  pointer-events: none !important;
}

main .section-block.soft .event-card .event-top > span,
main .section-block.soft .event-card .event-top > time {
  min-height: 28px !important;
  display: inline-flex !important;
  align-items: center !important;
  padding: 4px 9px !important;
  border: 1px solid rgb(255 255 255 / 55%) !important;
  border-radius: 999px !important;
  color: #27344f !important;
  background: rgb(255 255 255 / 88%) !important;
  box-shadow: 0 5px 14px rgb(31 46 76 / 9%) !important;
  font-size: .63rem !important;
  font-weight: 900 !important;
  backdrop-filter: blur(8px) !important;
}

main .section-block.soft .event-card h3 {
  margin: 14px 15px 7px !important;
  color: #293554 !important;
  font-size: .94rem !important;
  font-weight: 900 !important;
  line-height: 1.65 !important;
}

main .section-block.soft .event-card > p {
  display: -webkit-box !important;
  overflow: hidden !important;
  margin: 0 15px !important;
  color: #666b73 !important;
  font-size: .74rem !important;
  line-height: 1.85 !important;
  -webkit-box-orient: vertical !important;
  -webkit-line-clamp: 3 !important;
  line-clamp: 3 !important;
}

main .section-block.soft .event-card .event-mention-chips {
  display: flex !important;
  max-width: 100% !important;
  margin: 10px 14px 0 !important;
  flex-wrap: nowrap !important;
  gap: 5px !important;
  overflow: hidden !important;
}

main .section-block.soft .event-card .event-mention-chip {
  max-width: 150px !important;
  min-width: 0 !important;
  flex: 0 1 auto !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

main .section-block.soft .event-card > small {
  display: block !important;
  margin: 9px 15px 0 !important;
  overflow: hidden !important;
  color: #98918a !important;
  font-size: .62rem !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

/* Keep action buttons compact at the bottom like the reference cards. */
main .section-block.soft .event-card > button,
main .section-block.soft .event-card > .record-edit-button,
main .section-block.soft .event-card > [class*="share"] {
  margin-top: 10px !important;
}

@media (max-width: 760px) {
  main .section-block.soft {
    overflow: hidden !important;
  }

  main .section-block.soft .cards-grid.event-grid,
  main .section-block.soft .event-grid {
    width: calc(100% + 18px) !important;
    max-width: calc(100% + 18px) !important;
    margin-inline-end: -18px !important;
    padding-inline-end: 18px !important;
  }

  main .section-block.soft .cards-grid.event-grid > .event-card,
  main .section-block.soft .event-grid > .event-card {
    width: min(78vw, 300px) !important;
    max-width: min(78vw, 300px) !important;
    min-width: min(78vw, 300px) !important;
    flex-basis: min(78vw, 300px) !important;
  }

  main .section-block.soft .event-card::before {
    height: 148px !important;
  }

  main .section-block.soft .event-card::after {
    top: 39px !important;
    width: 78px !important;
    height: 78px !important;
    font-size: 40px !important;
  }
}
`

  document.head.appendChild(style)
}

installHomeNewsLayoutFix()

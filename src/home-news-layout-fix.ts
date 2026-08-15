const STYLE_ID = 'sila-home-news-layout-fix'

function installHomeNewsLayoutFix() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
/* Keep the home "latest news" cards horizontally swipeable on phones,
   while allowing every card to keep its own natural content height. */
@media (max-width: 760px) {
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
    gap: 10px !important;
    padding-inline: 2px 18px !important;
    padding-bottom: 6px !important;
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
    width: min(84vw, 520px) !important;
    max-width: min(84vw, 520px) !important;
    min-width: min(84vw, 520px) !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    flex: 0 0 min(84vw, 520px) !important;
    align-self: flex-start !important;
    margin: 0 !important;
    scroll-snap-align: start !important;
    transform: none !important;
  }

  main .section-block.soft .event-card > p {
    display: -webkit-box !important;
    overflow: hidden !important;
    -webkit-box-orient: vertical !important;
    -webkit-line-clamp: 3 !important;
    line-clamp: 3 !important;
  }

  main .section-block.soft .event-card .event-mention-chips {
    display: flex !important;
    max-width: 100% !important;
    flex-wrap: wrap !important;
    gap: 5px !important;
    overflow: visible !important;
  }

  main .section-block.soft .event-card .event-mention-chip {
    max-width: 100% !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
  }
}
`

  document.head.appendChild(style)
}

installHomeNewsLayoutFix()

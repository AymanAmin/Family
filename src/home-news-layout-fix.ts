const STYLE_ID = 'sila-home-news-layout-fix'

function installHomeNewsLayoutFix() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
/* Keep the home "latest news" feed vertical and content-sized on phones.
   Older mobile rules turn .event-grid into a horizontal auto-flow grid,
   which makes every card inherit the height of the tallest item. */
@media (max-width: 760px) {
  main .section-block.soft .cards-grid.event-grid,
  main .section-block.soft .event-grid {
    display: flex !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 9px !important;
    grid-auto-flow: row !important;
    grid-auto-columns: auto !important;
    grid-auto-rows: auto !important;
    grid-template-columns: none !important;
    grid-template-rows: none !important;
    overflow: visible !important;
    overflow-x: visible !important;
    overflow-y: visible !important;
    scroll-snap-type: none !important;
    scroll-behavior: auto !important;
    transform: none !important;
  }

  main .section-block.soft .cards-grid.event-grid > .event-card,
  main .section-block.soft .event-grid > .event-card {
    position: relative !important;
    display: block !important;
    box-sizing: border-box !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    flex: 0 0 auto !important;
    align-self: stretch !important;
    margin: 0 !important;
    scroll-snap-align: none !important;
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

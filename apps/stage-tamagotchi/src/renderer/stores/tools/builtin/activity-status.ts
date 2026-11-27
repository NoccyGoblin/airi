/**
 * FAIRY: a few words about what the character does right now, for the bubble above her. Each tool call gets one
 * line, built from the tool and its input. The owner reads it at a glance, so it stays short.
 */

const MAX_DETAIL = 28

/** A value from the tool input, cut to a short detail. */
function detail(value: unknown) {
  if (typeof value !== 'string')
    return ''
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL - 1).trimEnd()}…` : text
}

function withDetail(start: string, value: unknown, end = '…') {
  const shown = detail(value)
  // A cut detail already ends with an ellipsis.
  const ending = shown.endsWith('…') && end.startsWith('…') ? end.slice(1) : end
  return shown ? `${start} ${shown}${ending}` : `${start}${end}`
}

type Input = Record<string, unknown>

const LINES: Record<string, (input: Input) => string> = {
  open_toolbox: () => 'Grabbing my tools…',
  open_app: input => withDetail('Opening', input.name),
  close_app: input => withDetail('Closing', input.name),
  open_website: input => withDetail('Opening', input.url),
  play_youtube: input => withDetail('Finding', input.query, ' on YouTube…'),
  media_control: () => 'Pressing a media key…',
  type_text: () => 'Typing…',
  press_keys: input => withDetail('Pressing', input.keys),
  discord_message: input => withDetail('Messaging', input.person, ' on Discord…'),
  wander_mode: input => input.on ? 'Time to fly around!' : 'Settling down…',
  read_app: input => withDetail('Looking at', input.app || 'the app'),
  click_element: () => 'Clicking…',
  click_on: input => withDetail('Clicking', input.target),
  circle_on_screen: input => withDetail('Circling', input.target),
  doodle: () => 'Doodling something for you…',
  describe_screen: () => 'Looking at your screen…',
  scroll: input => `Scrolling ${input.direction === 'up' ? 'up' : 'down'}…`,
  browser_open: input => withDetail('Opening', input.url),
  browser_read: () => 'Reading the page…',
  browser_click: () => 'Clicking on the page…',
  browser_type: () => 'Typing on the page…',
  browser_back: () => 'Going back…',
  browser_scroll: () => 'Scrolling the page…',
  browser_close: () => 'Closing my browser…',
  find_files: input => withDetail('Looking for', input.query),
  list_folder: () => 'Looking in a folder…',
  open_file: () => 'Opening a file…',
  move_files: () => 'Moving files…',
  trash_files: () => 'Putting files in the bin…',
  set_reminder: () => 'Setting a reminder…',
  list_reminders: () => 'Checking your reminders…',
  cancel_reminder: () => 'Cancelling a reminder…',
  create_routine: () => 'Setting up a routine…',
  list_routines: () => 'Checking your routines…',
  delete_routine: () => 'Removing a routine…',
  pause_routine: () => 'Pausing a routine…',
  watch_for: input => withDetail('Keeping an eye out for', input.what),
  list_watches: () => 'Checking what I watch…',
  stop_watching: () => 'Stopping a watch…',
  sticky_note: () => 'Writing you a note…',
  play_game: input => input.game === 'tic-tac-toe' ? 'Setting up tic-tac-toe…' : 'Ready for rock, paper, scissors…',
  web_search: input => withDetail('Searching', input.query),
  wikipedia: input => withDetail('Reading up on', input.query ?? input.title),
  get_weather: () => 'Checking the weather…',
  league_lookup: () => 'Looking up League stats…',
  league_live_game: () => 'Checking your League game…',
}

/**
 * The bubble line for a tool call, or nothing for a tool that does not show, such as a memory note.
 *
 * @example
 * activityLine('open_app', { name: 'Discord' }) // => 'Opening Discord…'
 */
export function activityLine(toolName: string, input: unknown): string | undefined {
  const line = LINES[toolName]
  return line ? line(input && typeof input === 'object' ? input as Input : {}) : undefined
}

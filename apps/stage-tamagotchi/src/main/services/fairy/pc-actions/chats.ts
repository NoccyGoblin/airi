/**
 * FAIRY: where a chat message would go when Enter is pressed in the window in front.
 *
 * - `direct`: a Discord direct message. Its window title starts with `@`, for example "@tom - Discord".
 * - `group`: any other Discord view, such as a server channel ("#general | Server - Discord") or a group chat.
 * - `other`: not Discord.
 *
 * An unknown Discord title counts as a group, so a mistake asks the owner once too often instead of sending.
 *
 * @example
 * chatKindOf('Discord', '@tom - Discord') // 'direct'
 */
export function chatKindOf(processName: string, title: string): 'direct' | 'group' | 'other' {
  if (processName.toLowerCase() !== 'discord')
    return 'other'
  return title.trim().startsWith('@') ? 'direct' : 'group'
}

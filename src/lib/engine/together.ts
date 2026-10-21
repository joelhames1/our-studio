// How the app talks about a household's hearts, whether it's two people or
// more. Two keep the words they've always had ("you both love", "Both",
// "Erin's hearts"); more get "shared hearts", "3 of 4" and "Everyone". Someone
// on their own, before they've invited anyone, gets words with nobody else in
// them. Used on the server and in the browser.

/** "Erin", "Erin and Sam", "Erin, Sam and Ana", "Erin, Sam and 3 others". */
export function listNames(names: string[]): string {
  if (!names.length) return 'Nobody else';
  if (names.length === 1) return names[0];
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}

/** The badge on a design more than one of you love: "Both", "3 of 4", "Everyone". Null for fewer than two. */
export function heartBadge(lovers: number, members: number): string | null {
  if (lovers < 2) return null;
  if (members <= 2) return 'Both';
  return lovers >= members ? 'Everyone' : `${lovers} of ${members}`;
}

/** A design you love and others do too: "You both love this", "Everyone loves this", "3 of 4 love this". */
export function sharedLine(lovers: number, members: number): string {
  if (members <= 2) return 'You both love this';
  return lovers >= members ? 'Everyone loves this' : `${lovers} of ${members} love this`;
}

/** How many designs you and someone else both love: "3 you both love", "3 shared hearts". */
export function sharedCount(n: number, members: number): string {
  return members <= 2 ? `${n} you both love` : `${n} shared heart${n === 1 ? '' : 's'}`;
}

/** What the designs you love along with someone else are called, as a heading. */
export const sharedTitle = (members: number) => (members <= 2 ? 'You both love' : 'Shared hearts');

/** "you" on your own, "both of you" for two, "everyone" for more. */
export const allOfYou = (members: number) => (members <= 1 ? 'you' : members === 2 ? 'both of you' : 'everyone');

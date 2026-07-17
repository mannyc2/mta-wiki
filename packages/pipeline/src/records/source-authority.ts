const OFFICIAL_PUBLIC_PUBLISHER_PATTERN =
  /\b(?:mta|metropolitan transportation authority|new york city transit|nyc transit|nyc dot|nycdot|new york city dot|(?:nyc|new york city) department of transportation|(?:nyc|new york city) mayor(?:['’]s)? office|office of the mayor)\b/iu;

export function isOfficialPublicPublisher(value: string): boolean {
  return OFFICIAL_PUBLIC_PUBLISHER_PATTERN.test(value);
}

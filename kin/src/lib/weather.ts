/** Weather, without an account, a key or a bill.
 *
 * Open-Meteo needs no API key and no signup, which matters more here than
 * any feature difference: a key would be a repository secret, and a
 * repository secret is a thing only one person can rotate and everybody has
 * to remember exists. This is a plain GET.
 *
 * It is cached for fifteen minutes by the fetch layer rather than called on
 * every Today render. Today is the most-opened screen in the app, and the
 * weather does not change between two people looking at it a minute apart.
 */

export type Weather = { tempC: number; label: string; isDay: boolean };

/** WMO weather interpretation codes, grouped to the distinctions a household
 * actually acts on. Nobody leaves the house differently for "slight" versus
 * "moderate" drizzle. */
function labelFor(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Mostly clear";
  if (code === 3) return "Cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code === 95) return "Thunderstorm";
  if (code >= 96) return "Thunderstorm with hail";
  return "—";
}

export async function getWeather(lat: number, lng: number): Promise<Weather | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}` +
    `&current=temperature_2m,weather_code,is_day`;

  try {
    // Coordinates are rounded to three decimals -- about a hundred metres --
    // so the cache key is a neighbourhood rather than a person's doorstep,
    // and it is shared rather than re-fetched each time somebody moves a
    // few paces.
    const response = await fetch(url, { next: { revalidate: 900 } });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
    };
    const current = json.current;
    if (!current || typeof current.temperature_2m !== "number") return null;
    return {
      tempC: Math.round(current.temperature_2m),
      label: labelFor(current.weather_code ?? -1),
      isDay: current.is_day !== 0,
    };
  } catch {
    // A weather service being down is not an error worth showing a family.
    // The panel simply leaves that line out.
    return null;
  }
}

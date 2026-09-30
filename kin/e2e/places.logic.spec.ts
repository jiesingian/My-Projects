import { test, expect } from "@playwright/test";
import { nominatimUrl, normalizeQuery, parseNominatim } from "@/lib/places";

test("only a query worth sending is sent, in one cache-friendly form", () => {
  expect(normalizeQuery("  SM   Megamall ")).toBe("sm megamall");
  expect(normalizeQuery("sm")).toBeNull();
  expect(normalizeQuery(null)).toBeNull();
  expect(normalizeQuery("x".repeat(121))).toBeNull();
});

test("the search leans to the Philippines without shutting out abroad", () => {
  const url = new URL(nominatimUrl("sm megamall"));
  expect(url.searchParams.get("viewbox")).toBe("116.9,21.2,126.7,4.5");
  expect(url.searchParams.get("bounded")).toBe("0");
  expect(url.searchParams.get("countrycodes")).toBeNull();
});

test("a Philippine result reads as barangay, city, province", () => {
  const [p] = parseNominatim([
    {
      name: "SM Megamall",
      display_name: "SM Megamall, EDSA, Wack-wack Greenhills, Mandaluyong, Eastern Manila District, Metro Manila, 1550, Philippines",
      address: { road: "EDSA", quarter: "Wack-wack Greenhills", city: "Mandaluyong", state: "Metro Manila", postcode: "1550", country: "Philippines" },
    },
  ]);
  expect(p).toEqual({
    label: "SM Megamall, EDSA, Wack-wack Greenhills, Mandaluyong, Metro Manila",
    street: "EDSA",
    barangay: "Wack-wack Greenhills",
    city: "Mandaluyong",
    province: "Metro Manila",
    zipCode: "1550",
    country: "Philippines",
  });
});

test("abroad names the country, and duplicates and junk are dropped", () => {
  const dubai = { name: "Dubai Mall", address: { road: "Financial Centre Road", city: "Dubai", country: "United Arab Emirates" } };
  const places = parseNominatim([dubai, dubai, {}, "nonsense"]);
  expect(places.map((p) => p.label)).toEqual(["Dubai Mall, Financial Centre Road, Dubai, United Arab Emirates"]);
  expect(parseNominatim({ error: "x" })).toEqual([]);
});

// Brand marks from idn-finlogos, pinned to a specific release.
const logos: Record<string, string> = {
  dana: "dana", gopay: "gopay", ovo: "ovo", shopeepay: "shopee-pay",
  linkaja: "linkaja", isaku: "i-saku", astrapay: "astra-pay",
  pln: "pln", telkomsel: "telkomsel", xl: "xl", indosat: "indosat",
  tri: "tri", smartfren: "smartfren", byu: "by-u",
};

export function ppobBrandArt(brand: string): string | undefined {
  const slug = logos[brand.toLowerCase().replace(/[^a-z0-9]/g, "")];
  return slug ? `https://cdn.jsdelivr.net/npm/idn-finlogos@2.5.1/dist/icons/${slug}.svg` : undefined;
}

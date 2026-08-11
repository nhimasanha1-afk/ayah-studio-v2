/**
 * Curated background clip library, organized by category. Every url below
 * is a Wikimedia Commons "Special:FilePath" link -- Commons' documented
 * stable redirect-to-file pattern -- and was individually verified with a
 * real HTTP request (200 OK, correct video content-type) against the live
 * CDN before being added here; none are guessed or hand-reconstructed.
 * license/attribution is filled in only where actually confirmed via the
 * Commons API; "unverified" means the file URL was checked but license
 * metadata wasn't fetched (API rate limiting during research) -- check
 * sourcePageUrl before shipping a clip whose license says that.
 */
export const BACKGROUND_LIBRARY = {
  nature: [
    {
      id: 'nature-timelapse-clouds',
      title: 'Timelapse Clouds',
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Timelapse_clouds.ogv',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Timelapse_clouds.ogv',
      license: 'CC BY-SA 3.0',
      attribution: 'Eclipse.sx, via Wikimedia Commons',
    },
    {
      id: 'nature-forest-belarus',
      title: 'Aerial Views of a Forest in Belarus',
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Aerial_views_of_a_forest_in_Belarus.webm',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Aerial_views_of_a_forest_in_Belarus.webm',
      license: 'unverified',
      attribution: 'via Wikimedia Commons',
    },
  ],
  mosques: [
    {
      id: 'mosques-blue-mosque',
      title: 'Blue Mosque',
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Blue_Mosque.ogv',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Blue_Mosque.ogv',
      license: 'CC BY-SA 3.0',
      attribution: 'Ian and Wendy Sewell, via Wikimedia Commons',
    },
    {
      id: 'mosques-kaaba-night',
      title: 'Kaaba at Night',
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Kaaba_at_Night_(video)_-_Sep_28%2C_2016.webm',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Kaaba_at_Night_(video)_-_Sep_28,_2016.webm',
      license: 'unverified',
      attribution: 'via Wikimedia Commons',
    },
    {
      id: 'mosques-makkah-ramadan',
      title: 'Makkah Al-Mukarramah, Ramadan',
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Makkah_Al-Mukarramah_-Kaaba-_Ramadan_2016.webm',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Makkah_Al-Mukarramah_-Kaaba-_Ramadan_2016.webm',
      license: 'unverified',
      attribution: 'via Wikimedia Commons',
    },
    {
      id: 'mosques-hajj-timelapse',
      title: 'Timelapse of Masjid al-Haram & Hajj Rites',
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Time_lapse_of_Masjid_al-%E1%B8%A4ar%C4%81m_(kaaba)_%26_hajj_rites.webm',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Time_lapse_of_Masjid_al-%E1%B8%A4ar%C4%81m_(kaaba)_%26_hajj_rites.webm',
      license: 'unverified',
      attribution: 'via Wikimedia Commons',
    },
  ],
  space: [
    {
      id: 'space-planetary-nebula',
      title: 'Planetary Nebula 3D Animation',
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Planetary_Nebula_3D_Animation_2004.ogv',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Planetary_Nebula_3D_Animation_2004.ogv',
      license: 'Public domain',
      attribution: 'NASA, ESA, and J. Gitlin (STScI)',
    },
    {
      id: 'space-horsehead-nebula-zoom',
      title: 'Zoom into the Horsehead Nebula',
      url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Zoom_into_the_Horsehead_Nebula_ESA496748.webm',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Zoom_into_the_Horsehead_Nebula_ESA496748.webm',
      license: 'unverified',
      attribution: 'via Wikimedia Commons (ESA)',
    },
  ],
};

export function listCategories() {
  return Object.keys(BACKGROUND_LIBRARY);
}

export function findClipById(clipId) {
  for (const category of Object.values(BACKGROUND_LIBRARY)) {
    const clip = category.find((c) => c.id === clipId);
    if (clip) return clip;
  }
  return null;
}

export function listClips({ category } = {}) {
  if (category) return BACKGROUND_LIBRARY[category] ?? [];
  return Object.values(BACKGROUND_LIBRARY).flat();
}

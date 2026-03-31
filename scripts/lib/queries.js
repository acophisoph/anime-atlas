export const QUERY_MEDIA_LIST = `
query QueryMediaList($page: Int, $perPage: Int, $type: MediaType, $sort: [MediaSort]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { currentPage hasNextPage lastPage total perPage }
    media(type: $type, sort: $sort) {
      id
      type
      format
      seasonYear
      popularity
      averageScore
      title { romaji english native }
      coverImage { large color }
      genres
      tags { id name category rank isAdult }
      studios { nodes { id name isAnimationStudio } }
      relations {
        edges { relationType(version: 2) }
        nodes { id type format seasonYear title { romaji english native } }
      }
    }
  }
}
`;

export const QUERY_MEDIA_STAFF = `
query QueryMediaStaff($id: Int, $page: Int, $perPage: Int) {
  Media(id: $id) {
    id
    staff(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage lastPage total perPage }
      edges {
        role
        node {
          id
          name { full native }
          languageV2
          image { large }
          siteUrl
        }
      }
    }
  }
}
`;

export const QUERY_MEDIA_CHARACTERS = `
query QueryMediaCharacters($id: Int, $page: Int, $perPage: Int) {
  Media(id: $id) {
    id
    characters(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage lastPage total perPage }
      edges {
        role
        node {
          id
          name { full native }
          image { large }
          siteUrl
        }
        voiceActors(language: JAPANESE) {
          id
          name { full native }
          languageV2
          image { large }
          siteUrl
        }
      }
    }
  }
}
`;

export const QUERY_PERSON = `
query QueryPerson($id: Int) {
  Staff(id: $id) {
    id
    name { full native }
    languageV2
    image { large }
    description(asHtml: false)
    siteUrl
    staffMedia(page: 1, perPage: 25, sort: POPULARITY_DESC) {
      edges { staffRole }
      nodes { id type title { romaji english native } averageScore seasonYear }
    }
  }
}
`;

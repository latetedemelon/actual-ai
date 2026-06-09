const LEGACY_NOTES_NOT_GUESSED = 'actual-ai could not guess this category';
const LEGACY_NOTES_GUESSED = 'actual-ai guessed this category';

// Tags are user-configurable and interpolated into RegExp, so escape any
// characters that would otherwise be interpreted as regex metacharacters.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class TagService {
  private readonly notGuessedTag: string;

  private readonly guessedTag: string;

  constructor(
    notGuessedTag: string,
    guessedTag: string,
  ) {
    this.notGuessedTag = notGuessedTag;
    this.guessedTag = guessedTag;
  }

  public addNotGuessedTag(notes: string): string {
    return this.appendTag(notes, this.notGuessedTag);
  }

  public addGuessedTag(notes: string): string {
    return this.appendTag(notes, this.guessedTag);
  }

  private appendTag(notes: string, tag: string): string {
    const clearedNotes = this.clearPreviousTags(notes);
    return `${clearedNotes} ${tag}`.trim();
  }

  public clearPreviousTags(notes: string): string {
    // Remove the more specific (longer) tag first. The not-guessed tag is
    // typically a superset of the guessed tag (e.g. "#actual-ai-miss" contains
    // "#actual-ai"), so stripping the shorter one first would eat part of the
    // longer tag and leave a dangling fragment (e.g. "-miss").
    const tags = [this.guessedTag, this.notGuessedTag]
      .sort((a, b) => b.length - a.length);

    let result = notes;
    tags.forEach((tag) => {
      result = result.replace(new RegExp(`\\s*${escapeRegExp(tag)}`, 'g'), '');
    });

    return result
      .replace(new RegExp(`\\s*\\|\\s*${escapeRegExp(LEGACY_NOTES_NOT_GUESSED)}`, 'g'), '')
      .replace(new RegExp(`\\s*\\|\\s*${escapeRegExp(LEGACY_NOTES_GUESSED)}`, 'g'), '')
      .replace(new RegExp(`\\s*${escapeRegExp(LEGACY_NOTES_GUESSED)}`, 'g'), '')
      .replace(new RegExp(`\\s*${escapeRegExp(LEGACY_NOTES_NOT_GUESSED)}`, 'g'), '')
      .trim();
  }

  public isNotGuessed(notes: string): boolean {
    return notes.includes(this.notGuessedTag);
  }
}

export default TagService;

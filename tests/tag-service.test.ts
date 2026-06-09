import TagService from '../src/transaction/tag-service';

const GUESSED_TAG = '#actual-ai';
const NOT_GUESSED_TAG = '#actual-ai-miss';

describe('TagService', () => {
  let tagService: TagService;

  beforeEach(() => {
    tagService = new TagService(NOT_GUESSED_TAG, GUESSED_TAG);
  });

  describe('addGuessedTag / addNotGuessedTag on clean notes', () => {
    it('appends the guessed tag', () => {
      expect(tagService.addGuessedTag('Coffee')).toBe('Coffee #actual-ai');
    });

    it('appends the not-guessed tag', () => {
      expect(tagService.addNotGuessedTag('Coffee')).toBe('Coffee #actual-ai-miss');
    });

    it('handles empty notes', () => {
      expect(tagService.addGuessedTag('')).toBe('#actual-ai');
    });
  });

  describe('clearPreviousTags', () => {
    it('removes the guessed tag', () => {
      expect(tagService.clearPreviousTags('Coffee #actual-ai')).toBe('Coffee');
    });

    it('fully removes the not-guessed tag without leaving "-miss"', () => {
      // Regression: the guessed tag "#actual-ai" is a prefix of the
      // not-guessed tag "#actual-ai-miss" and must not be stripped first.
      expect(tagService.clearPreviousTags('Coffee #actual-ai-miss')).toBe('Coffee');
    });

    it('returns notes unchanged when there are no tags', () => {
      expect(tagService.clearPreviousTags('Coffee')).toBe('Coffee');
    });
  });

  describe('re-tagging is idempotent (no fragment accumulation)', () => {
    it('does not accumulate "-miss" across repeated not-guessed runs', () => {
      let notes = 'Coffee';
      for (let i = 0; i < 4; i++) {
        notes = tagService.addNotGuessedTag(notes);
      }
      expect(notes).toBe('Coffee #actual-ai-miss');
    });

    it('produces a clean note when a previously missed transaction is guessed', () => {
      const missed = tagService.addNotGuessedTag('Coffee');
      expect(tagService.addGuessedTag(missed)).toBe('Coffee #actual-ai');
    });
  });

  describe('isNotGuessed', () => {
    it('detects the not-guessed tag', () => {
      expect(tagService.isNotGuessed('Coffee #actual-ai-miss')).toBe(true);
    });

    it('returns false for the guessed tag only', () => {
      expect(tagService.isNotGuessed('Coffee #actual-ai')).toBe(false);
    });
  });

  describe('custom tags with regex metacharacters', () => {
    it('escapes special characters when clearing tags', () => {
      const service = new TagService('[miss]', '(ai+)');
      expect(service.clearPreviousTags('Coffee (ai+)')).toBe('Coffee');
      expect(service.clearPreviousTags('Coffee [miss]')).toBe('Coffee');
    });
  });

  describe('legacy note migration cleanup', () => {
    it('clears legacy guessed notes', () => {
      expect(
        tagService.clearPreviousTags('Coffee actual-ai guessed this category'),
      ).toBe('Coffee');
    });

    it('clears legacy pipe-separated guessed notes', () => {
      expect(
        tagService.clearPreviousTags('Coffee | actual-ai guessed this category'),
      ).toBe('Coffee');
    });
  });
});

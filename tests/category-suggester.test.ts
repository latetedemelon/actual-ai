import CategorySuggester from '../src/transaction/category-suggester';
import CategorySuggestionOptimizer from '../src/category-suggestion-optimizer';
import SimilarityCalculator from '../src/similarity-calculator';
import TagService from '../src/transaction/tag-service';
import type { ActualApiServiceI, APICategoryGroupEntity } from '../src/types';
import GivenActualData from './test-doubles/given/given-actual-data';

function buildApiServiceMock() {
  return {
    createCategoryGroup: jest.fn(() => Promise.resolve('new-group-id')),
    createCategory: jest.fn(() => Promise.resolve('new-category-id')),
    updateTransactionNotesAndCategory: jest.fn(() => Promise.resolve(undefined)),
  } as unknown as ActualApiServiceI & {
    createCategoryGroup: jest.Mock;
    createCategory: jest.Mock;
    updateTransactionNotesAndCategory: jest.Mock;
  };
}

function buildSuggester(apiService: ActualApiServiceI) {
  return new CategorySuggester(
    apiService,
    new CategorySuggestionOptimizer(new SimilarityCalculator()),
    new TagService('#actual-ai-miss', '#actual-ai'),
  );
}

describe('CategorySuggester', () => {
  test('reuses an existing category instead of recreating it (issue #384)', async () => {
    const apiService = buildApiServiceMock();
    const suggester = buildSuggester(apiService);

    const transaction = GivenActualData.createTransaction('tx1', -10, 'Some Payee');

    const suggested = new Map([
      ['Bank:Bank Transaction', {
        name: 'Bank Transaction',
        groupName: 'Bank',
        groupIsNew: false,
        transactions: [transaction],
      }],
    ]);

    const categoryGroups: APICategoryGroupEntity[] = [
      {
        id: 'grp-bank',
        name: 'Bank',
        categories: [{ id: 'cat-existing', name: 'Bank Transaction', group_id: 'grp-bank' }],
      },
    ];

    await suggester.suggest(suggested, [transaction], categoryGroups);

    expect(apiService.createCategoryGroup).not.toHaveBeenCalled();
    expect(apiService.createCategory).not.toHaveBeenCalled();
    expect(apiService.updateTransactionNotesAndCategory).toHaveBeenCalledWith(
      'tx1',
      expect.any(String),
      'cat-existing',
    );
  });

  test('creates a category when it does not already exist', async () => {
    const apiService = buildApiServiceMock();
    const suggester = buildSuggester(apiService);

    const transaction = GivenActualData.createTransaction('tx2', -20, 'Another Payee');

    const suggested = new Map([
      ['Pets:Pet Supplies', {
        name: 'Pet Supplies',
        groupName: 'Pets',
        groupIsNew: true,
        transactions: [transaction],
      }],
    ]);

    // "Pets" group does not exist yet.
    const categoryGroups: APICategoryGroupEntity[] = [];

    await suggester.suggest(suggested, [transaction], categoryGroups);

    expect(apiService.createCategoryGroup).toHaveBeenCalledWith('Pets');
    expect(apiService.createCategory).toHaveBeenCalledWith('Pet Supplies', 'new-group-id');
    expect(apiService.updateTransactionNotesAndCategory).toHaveBeenCalledWith(
      'tx2',
      expect.any(String),
      'new-category-id',
    );
  });
});

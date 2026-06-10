import type { TransactionEntity } from '@actual-app/core/src/types/models';
import type { ActualApiServiceI } from '../types';
import { APICategoryGroupEntity } from '../types';
import CategorySuggestionOptimizer from '../category-suggestion-optimizer';
import TagService from './tag-service';

class CategorySuggester {
  private readonly actualApiService: ActualApiServiceI;

  private readonly categorySuggestionOptimizer: CategorySuggestionOptimizer;

  private readonly tagService: TagService;

  constructor(
    actualApiService: ActualApiServiceI,
    categorySuggestionOptimizer: CategorySuggestionOptimizer,
    tagService: TagService,
  ) {
    this.actualApiService = actualApiService;
    this.categorySuggestionOptimizer = categorySuggestionOptimizer;
    this.tagService = tagService;
  }

  public async suggest(
    suggestedCategories: Map<string, {
            name: string;
            groupName: string;
            groupIsNew: boolean;
            groupId?: string;
            transactions: TransactionEntity[];
        }>,
    uncategorizedTransactions: TransactionEntity[],
    categoryGroups: APICategoryGroupEntity[],
  ): Promise<void> {
    // Optimize categories before applying/reporting
    const optimizedCategories = this.categorySuggestionOptimizer
      .optimizeCategorySuggestions(suggestedCategories);

    console.log(`Creating ${optimizedCategories.size} optimized categories`);

    // Resolve unique group names to IDs sequentially before the parallel
    // category creation. The LLM-supplied `groupIsNew` flag cannot be
    // trusted (it sometimes claims existing groups are new), and creating
    // groups in parallel races on the Actual Budget API which throws
    // "category group already exists" when two creations collide.
    const uniqueGroupNames = Array.from(new Set(
      Array.from(optimizedCategories.values()).map((s) => s.groupName),
    ));
    const groupIdByName = new Map<string, string>();
    // eslint-disable-next-line no-restricted-syntax
    for (const groupName of uniqueGroupNames) {
      const existing = categoryGroups.find(
        (g) => g.name.toLowerCase() === groupName.toLowerCase(),
      );
      if (existing) {
        groupIdByName.set(groupName, existing.id);
      } else {
        try {
          const newId = await this.actualApiService.createCategoryGroup(groupName);
          groupIdByName.set(groupName, newId);
          console.log(`Created new category group "${groupName}" with ID ${newId}`);
        } catch (error) {
          console.error(`Error creating category group ${groupName}:`, error);
        }
      }
    }

    // Use optimized categories instead of original suggestions
    await Promise.all(
      Array.from(optimizedCategories.entries()).map(async ([_key, suggestion]) => {
        try {
          const groupId = groupIdByName.get(suggestion.groupName);
          if (!groupId) {
            throw new Error(`Missing groupId for category ${suggestion.name}`);
          }

          // The suggested category may already exist in the target group: the LLM
          // sometimes proposes a name that's already present, and Actual throws
          // "category already exists in group" on a duplicate insert (which would
          // otherwise crash the run). Reuse the existing category instead.
          const existingGroup = categoryGroups.find((g) => g.id === groupId);
          const existingCategory = existingGroup?.categories?.find(
            (c) => c.name.toLowerCase() === suggestion.name.toLowerCase(),
          );

          let newCategoryId: string;
          if (existingCategory) {
            newCategoryId = existingCategory.id;
            console.log(`Reusing existing category "${suggestion.name}" with ID ${newCategoryId}`);
          } else {
            newCategoryId = await this.actualApiService.createCategory(
              suggestion.name,
              groupId,
            );
            console.log(`Created new category "${suggestion.name}" with ID ${newCategoryId}`);
          }

          // Use Promise.all with map for nested async operations
          await Promise.all(
            suggestion.transactions.map(async (transaction) => {
              await this.actualApiService.updateTransactionNotesAndCategory(
                transaction.id,
                this.tagService.addGuessedTag(transaction.notes ?? ''),
                newCategoryId,
              );
              console.log(`Assigned transaction ${transaction.id} to new category ${suggestion.name}`);
            }),
          );
        } catch (error) {
          console.error(`Error creating category ${suggestion.name}:`, error);
        }
      }),
    );
  }
}

export default CategorySuggester;

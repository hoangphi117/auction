export class PaginationHelper {
  static DEFAULT_LIMIT = 3;

  static parsePage(req, limit = this.DEFAULT_LIMIT) {
    const page = parseInt(req.query.page) || 1;
    return {
      page,
      limit,
      offset: (page - 1) * limit
    };
  }

  static buildPaginationData(totalCount, page, limit) {
    const totalPages = Math.ceil(totalCount / limit);
    const from = totalCount === 0 ? 0 : (page - 1) * limit + 1;
    const to = Math.min(page * limit, totalCount);

    return {
      totalCount,
      from,
      to,
      currentPage: page,
      totalPages
    };
  }

  static async paginate(req, queryFn, countFn, limit = this.DEFAULT_LIMIT) {
    const { page, offset } = this.parsePage(req, limit);
    const items = await queryFn(limit, offset);
    const total = await countFn();
    const totalCount = parseInt(total.count) || 0;

    return {
      items,
      ...this.buildPaginationData(totalCount, page, limit)
    };
  }
}

export interface Book {
    key: string;
    title: string;
    authors: Author[];
    first_publish_year?: number;
    cover_id?: number;
    description?: string | Description;
}

export interface Author {
    name: string;
}

export interface Description {
    value: string;
}
import assert from "assert";

export const testCases = (execute) => ({
    "query list of entities": () => {
        const query = `
            {
                books {
                    id
                    title
                }
            }
        `;

        return execute(query).then(result =>
            assert.deepEqual(result, {
                "books": [
                    {
                        "id": 1,
                        "title": "Leave It to Psmith",
                    },
                    {
                        "id": 2,
                        "title": "Right Ho, Jeeves",
                    },
                    {
                        "id": 3,
                        "title": "Catch-22",
                    }
                ]
            })
        );
    },

    "querying list of entities with child entity": () => {
        const query = `
            {
                books {
                    id
                    author {
                        name
                    }
                }
            }
        `;

        return execute(query).then(result =>
            assert.deepEqual(result, {
                "books": [
                    {
                        "id": 1,
                        "author": {
                            "name": "PG Wodehouse",
                        }
                    },
                    {
                        "id": 2,
                        "author": {
                            "name": "PG Wodehouse",
                        }
                    },
                    {
                        "id": 3,
                        "author": {
                            "name": "Joseph Heller",
                        }
                    }
                ]
            })
        );
    },

    "querying single entity with arg": () => {
        const query = `
            {
                author(id: 1) {
                    name
                }
            }
        `;

        return execute(query).then(result =>
            assert.deepEqual(result, {
                "author": {
                    "name": "PG Wodehouse"
                }
            })
        );
    },

    "single entity is null if not found": () => {
        const query = `
            {
                author(id: 100) {
                    name
                }
            }
        `;

        return execute(query).then(result =>
            assert.deepEqual(result, {
                "author": null,
            })
        );
    },

    "querying single entity with child entities": () => {
        const query = `
            {
                author(id: 1) {
                    books {
                        title
                    }
                }
            }
        `;

        return execute(query).then(result =>
            assert.deepEqual(result, {
                "author": {
                    "books": [
                        {"title": "Leave It to Psmith"},
                        {"title": "Right Ho, Jeeves"},
                    ],
                },
            })
        );
    }
});

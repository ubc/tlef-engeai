# Databases

Prerequisites : Agentic Engineering, MongoDB Sample app, Qdrant Sample app
Relevant readings: ACID, BASE, Idempotenency
Database is a crucial part in EngE-AI, where we store all the user data. We use 3 databases :

- MongoDB (No-SQL database): To store users data and application metadata
- Qdrant: Vector database to store documents chunks in a vector format

Developer notes: If you are a developer, we expect you are familiar with the UBC LTIC sample app for both MongoDB and Qdrant, as mention in the prerequisites. Furthermore, we also expect you to understand database principles, particularly on No-SQL Databases. We have installed the premeasurements on database should be operated: synthax standards, stragety, and testing. Understanding the fundamentals allows you to be criticl about the AI decision, which allows you to debug for any encountered error.
By the end of this page, you may be familiar with:

1. EngE-AI’s MongoDB:
    1. Agentic skills Testing
    2. Collection Organization
    3. Important properties
        1. Changeable attributes
        2. Soft deletion
2. Qdrant Vector Database:
    1. Essential Variables
    2. How to debug

## MongoDB

MongoDB is a No-SQL  database used in our app to store any non-vectorized data, such ass application metadata, courses and even users data, even the conversation is stored inside mongoDB. This particular chapter elaborates more on the rules and how to debug it using AI coding tools.

### Agentic Skills, Implementation and Testing

The skills description on the code writing rules for database operation has been explicitly written in the `mongodb-master.mdc` and `mongo-data-layer` , and most of the time (using plan mode) the outcome: Coder and Automated testing is accurate, and adhering to databases principles. For any `CRUD` operation,s coding agent automatically generates modern `mongoDB` ’s function, along with BSON Schema.
Developer Mode: BSON Schema allows queries to use MongoDB’s native syntax, enabling MongoDB to optimize query execution.
Nonetheless, as a developer, we should critically analyze for any AI-Agent generated code, meaning we should ensure that the generated code is optimize, clean, and follow the pattern that we have inherently built.
You may want to consider this question while having any MongoDB operation in your implementation:

1. Does you MongoDB query uses BSON schema format ? If not, justify yourself the correctness of your implementation.
2. Does your implementation follows the best practice on the runtime and space complexity ?
3. How large is the content that is required for CRUD ? For large query, would you prefer continuous changes, or one big changes ?
4. While querying MongoDB, have you used `try-catch` method to implementation safety ? (Imagine somehow if the mongoDB server is down )
5. How extensive is your test case ? Does it cover the entire possible cases?

The current implementation on MongoDB currently uses facade structure, where the code functionalities are modularate based on its functionalities, rather than putting everything in one big chunk of code. This is used to reduce the complexity of the code itself considering how extensive the mongoDB implementation truly is. You may see that inside `src/db` , `enge-ai-mongodb.ts` hold the linker function and it passses to its facade child inside the `src/db/mongo` , for example academic period.
You may also want to be expilit on the attribute type on your typescript interface. If an attribute is a number, or option of a list, or a string. This will helps you later during your debugging process

### Collection Organization

EngE-AI’s Collection organization is configured in 2 layers: **Application metadata,** **Courses dedicated data, external connection**.
mermaid diagram…
**Application Metadata** is where the application’s data such as `active-course-list` and `active-course-users`, `academic-periods`  take place. they stores EngE-AI application data rather-than soring information ahout a specific course.
**Course dedicated data** is where we stored  the information about the data on each application, this inlcudes the collection of flags, memory agent, jobs, and user’s chat on a specific course.
**External connection** is where somemeta data is stored for third party purposes, this include `canvas-connections` and `canvas-tokens` .
We configure each collection such that each item in the collecition has the same schema compared to ensure consistency across item. This is really useful when it come to data migration, which is discussed later in the migration chapter.

### Essential Properties

While EngE-AI is developed, some of the attribute are uniquely configured to address issues, such as:

1. Changeable attributes

Some of the attributes are changable, such as `item title` , and any other content. On this kind of situation, we might need to add a created date, and updated date on the instance. The reason is to ease the debugging processes, allows us to hypothesize the faulty reason : Code or Infrastructure reason.

2. Soft Deletion

Sometimes we want the user to have the capabilities of deleting some data, yet as the isntructor, we do not really want if the data is completely removed (some of the data can be really esssential). This is where soft deletion comes in - allows the data to be removed in the user;s interface, but not necessarily in the user itself.

To do so, `isDeleted` attribute (or something similar) is utilitzed to indicate for any safe deletion, which is being used in out chat feature (see `src/db/mongo/chat-mongo.ts`)

## Qdrant Vector Database

What if we want to use some small part context form a 1-0 page document. It would be really not effective if we sent the entire document to the LLM, as it spurs the LLM to hallucinates, and really expensive. We use a retreival aumgmented generation (RAG) to adress this issue, where it allows us to send a small part or chunk of the document to the LLM as an additional context. Retrieval Augmented Generation is a method to
To store the vectorrized version of the document, we need a vectore database, and we use Qdrant in EngE-AI. We have attached boht the dependecies and the example app for Qdrant and RAG, see. …. and …. for more.
Similar to mongoDB, we also have the the documentation for mongoDB in ….. inside the application, see for more
Having RAG embedded to EngE-AI system allows the LLM to have additional course context for EngE-AI, thereby the response can be more contextually accurate to the course material. This is the illustration in (APSC 183 context)

### Important Variables

In RAG system, three main variables that are used for RAG system: `RAG_CHUNK_SIZE`, `RAG_OVERLAP_SIZE`, and `RAG_CHUNKING_STRATEGY`. `RAG_CHUNK_SIZE` means the maximum size of a the document’s chunk, and measured in tokens. `RAG_OVERLAP_SIZE` is the size where the adjecent chunk can overlap each other. For example: set the `RAG_CHUNK_SIZE = 1200` , `RAG_CHUNK_OVERLAP = 200.`In a single retrieval, `RAG_chunk ‘A’ and chunk ‘B’, are adjacent, where chunk ‘A’, comes before ‘B’ (assume that both chunk are fully occupied). Then the last 200 tokens in `Chunk A` should have the similar roder of strings in the first 200 tokens in chunk B. The reason for that is so the LLm can acquire enough connecting context between adjacent chunk.
Additionally `scoreThresold` is a variable that is used to determine how relevant a chunk with the inserted context in an emdedding models. The `scoreThroesold`is determined based on the strategy, for example cosine or dot Please note that any spelling mistakes is really crucial in emdedding models. For example `Cat`  is has more score

### How to Debug

The true challenge of a RAG system is the correctness of the retrieved context. Some chunks are underconfident and overconfident, and there are two variabes that you should take a look into: number of retrieved chunk and the scoreThreshold.
It is recommendable to test any document in the UBC LTIC qdrant example app rather than the EngE-AI’s local app directly, because UBC’s LTIC qdrant are an isolated information only for determining the score and relevance for each chunk, and it may be too expansive when we directly use EngE-AI for testing. You may want to take sometimes to take a skim through the example’s app code and experiemnting around to determien the best fit for the thresold score, retreival strategy, or even the number of retreived chunk wiht correct justification.

## Migration

sometimes, we modify, remove or add something to an item’s attribute or subattibute. Migration is a way to synchromize the attributes pon the databse such that the outdated item can be adjusted with the newest structure. See the migration documentation for more.
On out implementation, we haver implemented a defensive method: check if attribute is atvailable, if not, then please set the default value. By having so, then we avoid any missing attirbute in the future. Having a migration feature allows us to make the attirbute to be more tidier, and so easier to debug.

## Conclusion

Overall, we have discuss about the organization, variables, MongoDB, and Qdrant

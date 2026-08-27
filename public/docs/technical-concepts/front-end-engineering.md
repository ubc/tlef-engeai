# Front End Engineering


The `front-End Developer` page outlines how you may develop EngE-AI front-end page by following some inherited components, and available best practices. It allows you to create a user-friendly and intuitive design. This page covers:

1. User Centered Design
2. Wireframing
3. Responsive desgin
4. Useful resources
5. Conclusion and Recommendation

## User Centered Design

User Centered Design is a well-known framework in the Human-Computer Interfaces where we, the desginers put the user as the main object for the app development. The main point of the app is to make the app is intuitive, and as user-friendly as possible to the intended users given the requirements that we have desgined previously. But users might be diverse , ranging from their age, background, etc. Therfore we use Personas.

### Personas

Persona can be describe as a fictional, yet a realistic representation of the users. It allows us to brainstorm the behavior of the intended users, and even describing their nitty-gritties on thier behavior. By describing our users personas, it really helps us describe how easy or complex we should desgin the app, button placement, and to other user-experience components.

Developer Notes: You may want to perform a persona by answering this example questions before you are developing a minor / major feature, either mentally, or written

```yaml
Who are the users ? 
Range of age of the users ? 
What apps that they are using, and how fluent they are using it ? 
Where are they comes from and what are the used app for people where they comes from? 
```

As EngE-AI is relatively a small app, we might not need meticuous personas, but this framework truely a good compass when you are about to developing any app.

### Styling Fundamentals

While developing the app, we should ensure that your updated desgin aligns with the styling that we previously have: such as components and color. For colows the EngE’AI Color palletes are:

for components, you might want to refer to our css stling for each page. You may want to use inspect for a manual adjustment on the frotn end components.

Google chrome provided an automated testing to evalutate your web accessibility, you may open fireworks in google chrome, and just click onthe accessibility. You may want to play around with thsi feature to assess your accessibility on other page / section.

Developer Notes: Rule of thumb - completing an action in the app should not take 3 steps one the user are in the main dashboard.

## Wireframe

Before we create a feature, it is better for us to understand how the flow of the app. The user-centered design framework is truely helpful to set up the feature’s wire frame. Wire frame is a non-coloric design that allows the desginer to mock the interface and desgin the flow pattern before heading to implementation. Setting the wireframe is important because we want do not want to set the desgin pattern while we are developing the app. This will take so much time in the process. 

When you are developing a new big feature, the flow should be properly described in the wireframe, such that the supervisor or the client can track the desgin process or giving you feedback. You might come over an idea, while you are desgining using the wireframe.

Using the wireframe also allows the llm to create more accurate styling, compared if you jsut giving the prompt of your feature. You may connect your desgin through screenshot or through MCP.

Please contact your supervisor both better clarification and access to EngE-AI wireframe repository.

## Responsive Design

We also put the flexibility to the users to use ENgE-AI, not only from dekstop, but also from their mobile devices. We Split the screen into 3: . In `CSS` the responsive desgin is handled by media query

## Usefull Resources

While you are developing your front-end you may want to visit fo searching throut some inspiration. Some pof the component are react & tailwing, based. You AI Agent however are smasrt enough to translate react component to our vanilla typescript. The sources are:

## Conclusion and Recommendation

Overall, Front end development is a crucial part while developing EngE-AI, this component directly interact with the user. To ensure the fluency, we adhere to user centered Design where we should think that the user is the main object of the development. There are other part as well such as wireframing, and responsive ddesign that also should take place.

While you are developing your front end, the recommended steps are:

1. Clearly define what is your problem (The part of Agentic Development)
2. Who is your intended user and the corresponded behaviour? You may create their personas either mentally or written
3. Create a wire frame of the newest implemented feature.
4. Integrate your wireframe to your Coding Agent, preferrably put into a plan mode
5. You may evaluate the produced outcome of your coding agent, For a small changes plase make the modification manually. Other wise you may directly chat with the coding agent or you may use plan mode as well.
6. While tweaking the styling, you might want to refer to any free styling depends onyour favour
7. make adjustment to responsive design, and repeat from step 5.

By the end of this page, you are expected to have an exposure how EngE-AI’s page are developed. Good Luck.